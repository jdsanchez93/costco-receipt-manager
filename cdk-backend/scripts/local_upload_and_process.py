#!/usr/bin/env python3
"""Local dev helper: runs the full upload -> OCR -> MySQL flow without
deploying anything to AWS.

Calls the local .NET API's get-upload-url (real HTTP), PUTs the image to
the real S3 bucket (real HTTP), then invokes receipt_processor/app.py's
lambda_handler directly as a plain Python function call -- no Lambda
runtime, no S3 event notification, no deployed infrastructure. Textract
still runs against real AWS; the internal API call at the end targets
your local dotnet run + Docker MySQL, since everything here runs on your
own machine.

Usage:
    python3 local_upload_and_process.py \
        --file ~/Pictures/costco_test.jpeg \
        --token "$AUTH_TOKEN" \
        --internal-api-key test-secret-for-local-verification

Requires: an AWS profile with s3:GetObject + textract:DetectDocumentText
on the dev bucket (set via --aws-profile, or already exported as
AWS_PROFILE), a running `dotnet run` API, and a running local MySQL.
"""

import argparse
import mimetypes
import os
import sys
from urllib.parse import urlparse

import requests


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--file', required=True, help='Path to a local receipt image')
    p.add_argument('--token', required=True, help='Auth0 bearer token (no "Bearer " prefix)')
    p.add_argument('--internal-api-key', required=True,
                    help='InternalApi:SharedSecret value from your user secrets')
    p.add_argument('--api-url', default='http://127.0.0.1:5002',
                    help='.NET API base URL (default: %(default)s)')
    p.add_argument('--content-type', default=None,
                    help='Overrides content-type auto-detected from the file extension')
    p.add_argument('--aws-profile', default=None,
                    help='AWS profile for S3/Textract (default: whatever is already active)')
    p.add_argument('--aws-region', default='us-east-1', help='(default: %(default)s)')
    return p.parse_args()


def main():
    args = parse_args()

    if args.aws_profile:
        os.environ['AWS_PROFILE'] = args.aws_profile
    os.environ.setdefault('AWS_DEFAULT_REGION', args.aws_region)

    content_type = args.content_type or mimetypes.guess_type(args.file)[0] or 'image/jpeg'

    # 1. Get a presigned upload URL from the local .NET API (Auth0-authenticated).
    resp = requests.post(
        f"{args.api_url}/api/receipts/get-upload-url",
        json={'contentType': content_type},
        headers={'Authorization': f'Bearer {args.token}'},
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    receipt_id, upload_url = body['receiptId'], body['uploadUrl']
    print(f"[1/3] Got upload URL for receiptId={receipt_id}")

    # 2. PUT the file to S3.
    with open(os.path.expanduser(args.file), 'rb') as f:
        put_resp = requests.put(upload_url, data=f, headers={'Content-Type': content_type}, timeout=30)
    put_resp.raise_for_status()

    parsed = urlparse(upload_url)
    bucket = parsed.netloc.split('.s3.')[0]
    key = parsed.path.lstrip('/')
    print(f"[2/3] Uploaded to s3://{bucket}/{key}")

    # 3. Invoke the vendored Lambda handler directly -- no Lambda runtime,
    # no S3 event notification. Env vars must be set before importing app,
    # since it reads them at module load time.
    os.environ['INTERNAL_API_URL'] = args.api_url
    os.environ['INTERNAL_API_KEY'] = args.internal_api_key
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'receipt-processor'))
    import app  # noqa: E402  (must import after setting env vars above)

    event = {'Records': [{'s3': {'bucket': {'name': bucket}, 'object': {'key': key}}}]}
    print("[3/3] Running Textract OCR + bridging to MySQL...")
    app.lambda_handler(event, None)

    print(f"\nDone. receiptId={receipt_id} -- check receipt_items/receipt_geometry in MySQL, "
          f"or GET {args.api_url}/api/receipts/receipt/{receipt_id}/geometry")


if __name__ == '__main__':
    main()
