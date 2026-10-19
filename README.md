# Costco Receipt Manager

Upload a photo of a Costco receipt, have its line items read automatically, and
split the total between the people who shared the trip.

Upload a receipt and it lands in S3, where Textract OCRs it and the parsed line
items are written back to the database. Add members to a receipt, assign items
to them, and the app computes per-person totals. Receipts can be shared
read-only through an expiring public link.

## Architecture

```
browser ──► CloudFront ─┬─► S3            Angular single-page app
                        └─► Cloudflare Tunnel ─► Raspberry Pi ─► MariaDB
                                                   (.NET API in Docker)

upload ───► S3 ─► Lambda ─► Textract ─► back to the API ─► MariaDB
```

The API is self-hosted on a Raspberry Pi behind a Cloudflare Tunnel, so it has
no inbound ports open. CloudFront is the only public front door and routes
`/api/*` to the tunnel, which also means the browser talks to a single origin
and CORS never enters the picture. OCR runs asynchronously off an S3 event.

| Layer | Technology |
|---|---|
| Frontend | Angular 22, Angular Material, Auth0 |
| API | ASP.NET Core 10, EF Core 9 (Pomelo) |
| Database | MariaDB 11.8 |
| OCR | AWS Textract via a Python Lambda |
| Hosting | S3 + CloudFront; self-hosted API behind Cloudflare Tunnel |
| Infrastructure | AWS CDK (TypeScript) |

## Running it locally

Requires Docker, the .NET 10 SDK, and Node 22.

```bash
# database
docker compose -f api/docker-compose.yml up -d

# API — http://localhost:5002 (Swagger at /swagger)
cd api/CostcoReceipts.Api && dotnet run

# frontend — http://localhost:4200, proxies /api to the API
cd frontend-angular && npm install && npm start
```

Two pieces of configuration are gitignored and need creating first:

- `frontend-angular/src/environments/environment.development.ts` — copy
  `environment.example.ts` and fill in your Auth0 application.
- API settings — put your Auth0 tenant, AWS profile and S3 bucket in user
  secrets (`dotnet user-secrets`) or `appsettings.Development.json`.

```bash
cd frontend-angular && npx ng test --watch=false   # unit tests
```

## Layout

```
api/
  CostcoReceipts.Api/        ASP.NET Core API — controllers, EF Core model, migrations
  CostcoReceipts.Migration/  data maintenance CLI (placeholder-contact merge)
  deploy/                    database backup script and systemd units for the Pi
  scripts/                   migration script generator
frontend-angular/            Angular SPA
cdk-backend/                 CDK stacks: S3 + CloudFront, and the OCR Lambda
  receipt-processor/         the Python Textract handler
docs/                        design record
```

## Deploying

The frontend deploys automatically: pushes to `main` that touch
`frontend-angular/` build and publish to S3 and CloudFront via GitHub Actions,
authenticating with OIDC rather than stored AWS keys.

The API is built and shipped to the Pi by hand, since the Pi has no inbound
network path. Database migrations are applied deliberately, with a separate
privileged account, after a backup. See `api/deploy/README.md`.

Infrastructure is three CDK stacks deployed by name — see
`cdk-backend/README.md`.

## Documentation

| File | Contents |
|---|---|
| `CLAUDE.md` | architecture and conventions, written for Claude Code but accurate for humans |
| `cdk-backend/README.md` | the CDK stacks and how to deploy them |
| `cdk-backend/BUCKETS.md` | receipt-image bucket configuration, which lives outside CDK |
| `cdk-backend/RUNBOOK.md` | how the October 2026 migration off AWS Lambda/DynamoDB was carried out |
| `api/deploy/README.md` | Pi operations and one-time AWS/GitHub setup |
| `docs/redesign-plan.md` | running design record |
