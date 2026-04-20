# Deployment Guide

## Production Environment

The application is deployed on **Fly.io** in the Frankfurt (fra) region as `angebotskonfigurator-emc2-v2`.

## Docker Configuration

### Dockerfile Overview

```dockerfile
FROM node:23.11.0-slim

# System dependencies for document generation
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    pkg-config \
    # LibreOffice for DOCX -> PDF conversion
    libreoffice \
    # LaTeX for .tex -> PDF compilation
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-lang-german \
    # Fonts
    fonts-dejavu \
    fonts-liberation

# Application
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
CMD ["npm", "run", "start"]
```

**Key System Dependencies**:
| Package | Purpose | Size Impact |
|---------|---------|-------------|
| LibreOffice 25.8.4 | DOCX -> PDF conversion | ~300MB |
| texlive-latex-base | LaTeX compilation | ~100MB |
| texlive-latex-extra | Additional LaTeX packages | ~50MB |
| texlive-fonts-recommended | Standard fonts | ~20MB |
| texlive-lang-german | German language support | ~10MB |
| fonts-dejavu, fonts-liberation | Document fonts | ~10MB |

## Fly.io Configuration

### `fly.toml`

```toml
app = "angebotskonfigurator-emc2-v2"
primary_region = "fra"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

**Key Settings**:
- **Region**: Frankfurt (fra) - close to German customers
- **Port**: 3000 (internal), HTTPS enforced externally
- **Auto-scaling**: Machines stop when idle, start on request
- **VM**: Shared CPU, 1GB RAM

## Environment Variables (Production)

These must be set in Fly.io secrets:

```bash
# Required
fly secrets set MONGODB_URI="mongodb+srv://..."
fly secrets set MONGODB_DB="KonfiguratorDB"

# Email
fly secrets set SMTP_HOST="smtp.example.com"
fly secrets set SMTP_PORT="587"
fly secrets set SMTP_EMAIL="noreply@example.com"
fly secrets set SMTP_PASS="***"

# Routing/Geocoding (optional but recommended)
fly secrets set ORS_API_KEY="***"
fly secrets set COMPANY_ADDRESS="Kornhausacker 10, Hof"
fly secrets set COMPANY_LAT="50.3135"
fly secrets set COMPANY_LNG="11.9128"

# External APIs
fly secrets set EXTERNAL_API_BASE="https://duschabtrennung-backend.fly.dev"
fly secrets set EXTERNAL_API_USER="***"
fly secrets set EXTERNAL_API_PASSWORD="***"

# Adobe PDF (optional)
fly secrets set PDF_SERVICES_CLIENT_ID="***"
fly secrets set PDF_SERVICES_CLIENT_SECRET="***"

# Postal delivery (optional)
fly secrets set BINECT_BASE_URL="https://app.binect.de/binectapi/v1"
fly secrets set BINECT_USERNAME="***"
fly secrets set BINECT_PASSWORD="***"

# Workflow
fly secrets set N8N_TODAYS_CUSTOMERS_URL="***"
fly secrets set PLANNING_API_BASE_URL="https://route-plannung.fly.dev"
```

## Deployment Commands

```bash
# Deploy to Fly.io
fly deploy

# View logs
fly logs

# SSH into running machine
fly ssh console

# Check status
fly status

# Scale up
fly scale count 2

# Set secrets
fly secrets set KEY=VALUE
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env file with required variables
cp .env.example .env  # (edit with your values)

# Start development server (auto-reload)
npm run dev

# Or start production mode locally
npm start
```

The development server uses `nodemon` to watch `src/` for changes and auto-restart.

## Health Check

```bash
# Local
curl http://localhost:3000/api/health

# Production
curl https://angebotskonfigurator-emc2-v2.fly.dev/api/health

# Via npm script
npm run health
```

Expected response:
```json
{
  "ok": true,
  "db": "KonfiguratorDB",
  "time": "2026-04-20T14:30:00.000Z"
}
```

## Database Seeding

After a fresh deployment, seed the product/service catalogs:

```bash
# Seed all product catalogs
npm run seed:products
npm run seed:flexofit
npm run seed:badewannen
npm run seed:badolux

# Seed services (if script exists)
node scripts/seedServices.js
```

## Security Considerations

- **No authentication**: All endpoints are publicly accessible. Rely on network-level security (CORS, CSP) and iframe embedding restrictions.
- **CORS Whitelist**: Only specific origins are allowed cross-origin requests.
- **CSP Headers**: Restrict iframe embedding to known domains (gconlineplus.de, emczwei.bitrix24.de, bau-formular.fly.dev).
- **Secrets**: Never commit `.env` to git. Use `fly secrets` for production.
- **MongoDB Atlas**: Uses cloud-hosted MongoDB with connection string authentication.

## Monitoring

- **Morgan**: HTTP request logging to stdout (visible in `fly logs`)
- **Health endpoint**: `/api/health` for uptime monitoring
- **Error logging**: Console.error for critical failures
- **No APM**: No application performance monitoring is configured

## Known Infrastructure Notes

- The Docker image is large (~1GB+) due to LibreOffice and LaTeX dependencies
- Cold starts may be slow due to image size (mitigated by `auto_start_machines`)
- PDF generation is CPU-intensive (LibreOffice headless conversion)
- 1GB RAM is sufficient for typical workloads but may struggle with concurrent PDF generation
- Puppeteer (headless Chrome) is included but may not work in the slim container without additional Chromium dependencies
