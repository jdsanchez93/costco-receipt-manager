import json
import os
import urllib.parse
import requests
from textract_ocr import get_receipt_data_from_s3

INTERNAL_API_URL = os.environ.get('INTERNAL_API_URL')
INTERNAL_API_KEY = os.environ.get('INTERNAL_API_KEY')


def _flatten_geometry(special_fields):
    """Turn Textract's {field_name: {label_*, value_*}} shape into a flat
    list of geometry rows, two per field (label + value), matching what
    the old store_receipt_geometry wrote as separate DynamoDB items."""
    rows = []
    for field_name, data in (special_fields or {}).items():
        for field_type, text_key, geometry_key in (
            ('label', 'label_text', 'label_geometry'),
            ('value', 'value_text', 'value_geometry'),
        ):
            geometry = data[geometry_key]
            rows.append({
                'fieldName': field_name,
                'fieldType': field_type,
                'text': data[text_key],
                'confidence': data['confidence'],
                'boundingBox': {
                    'width': geometry['BoundingBox']['Width'],
                    'height': geometry['BoundingBox']['Height'],
                    'left': geometry['BoundingBox']['Left'],
                    'top': geometry['BoundingBox']['Top'],
                },
                'polygon': [
                    {'x': point['X'], 'y': point['Y']}
                    for point in geometry['Polygon']
                ],
            })
    return rows


def _build_items_payload(items):
    # discount always has a value (defaults to 0.0 in parse_items_from_lines) —
    # send it as-is, don't collapse a genuine $0.00 discount into null.
    return [
        {
            'itemNumber': item.get('item_number'),
            'itemName': item['item'],
            'price': item['price'],
            'discount': item['discount'],
            'taxCode': item.get('tax_code'),
        }
        for item in items
    ]


def lambda_handler(event, context):
    """S3-triggered Lambda: runs Textract OCR on a newly uploaded receipt
    image, then POSTs the parsed items + geometry to the .NET API's
    internal bridge endpoint, which persists them into MySQL.

    Event doc: https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html
    """

    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        receipt_items, special_fields = get_receipt_data_from_s3(bucket, key)

        # Extract receipt_id from key (expected format: uploads/{user_id}/{receipt_id}.jpg).
        # user_id is no longer needed downstream — the .NET API already
        # knows the receipt's owner from when the upload URL was issued.
        parts = key.split('/')
        if len(parts) >= 3 and parts[0] == 'uploads':
            receipt_id = parts[2].rsplit('.', 1)[0]  # strip file extension
        else:
            raise ValueError(f"Unexpected S3 key format: {key}")

        payload = {
            'items': _build_items_payload(receipt_items),
            'geometry': _flatten_geometry(special_fields),
        }

        resp = requests.post(
            f"{INTERNAL_API_URL}/api/internal/receipts/{receipt_id}/ocr-results",
            json=payload,
            headers={'X-Internal-Api-Key': INTERNAL_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()

        if special_fields:
            print(f"Detected special fields for receipt {receipt_id}: {list(special_fields.keys())}")

    except Exception as e:
        print('Error:')
        print(e)
        raise e
