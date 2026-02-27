# Rank Tracking Baseline (GSC)

This baseline adds snapshot + diff reporting using Google Search Console Search Analytics data.

## Delivered scripts

- `scripts/seo-rank-snapshot.mjs`
- `scripts/seo-rank-diff.mjs`

## NPM commands

- `npm run rank:fetch -- --days 28`
- `npm run rank:diff -- --snap1 <file> --snap2 <file>`
- `npm run rank:report`
- `npm run rank:weekly`
- `npm run ctr:analyze`

## Data storage

Snapshots are stored in `data/rank-snapshots/` as timestamped JSON files:

- `rank-snapshot-<property>-<start>-to-<end>-<timestamp>.json`
- `latest-rank-snapshot.json` (overwritten each fetch)

Diff report default output:

- `data/rank-snapshots/latest-rank-report.md`

## GSC setup (Mohamed)

1. In Google Cloud Console, enable **Search Console API**.
2. Create a **Service Account** and generate a JSON key.
3. In Google Search Console, open your property and add the service account email as a user (Owner or Full user).
4. Configure credentials using one of the following:

### Option A: key file path (recommended local)

Set one env var:

- `GOOGLE_APPLICATION_CREDENTIALS=<absolute path to service-account.json>`

or

- `GSC_SA_KEY_PATH=<absolute path to service-account.json>`

### Option B: inline JSON secret

Set:

- `GSC_SA_KEY=<full service account JSON>`

## Property value

Default property is:

- `sc-domain:convert-craft.com`

Override with:

- `--siteUrl=https://www.convert-craft.com/`
- or `--siteUrl=sc-domain:convert-craft.com`

## Usage examples

### 1) Fetch latest 28-day snapshot

```bash
npm run rank:fetch -- --days 28
```

### 2) Fetch explicit date range

```bash
npm run rank:fetch -- --startDate 2026-01-01 --endDate 2026-01-28
```

### 3) Compare two snapshots

```bash
npm run rank:diff -- --snap1 data/rank-snapshots/rank-snapshot-...old.json --snap2 data/rank-snapshots/rank-snapshot-...new.json
```

### 4) Generate latest report automatically

```bash
npm run rank:report
```

### 5) Run weekly automation (fetch current + previous period + report)

```bash
npm run rank:weekly -- --days 28 --siteUrl https://www.convert-craft.com/
```

Default report output:

- `rank-reports/YYYY-MM-DD-weekly-report.md`

You can also pass:

- `--key <path>` (service account key file)
- `--endDate YYYY-MM-DD` (anchor date for reproducible runs)
- `--top 10 --minImpressions 500 --opportunityCtr 0.015`

If previous-period fetch is unavailable, the script writes a baseline report with current-period summary only.

## Automation setup

### Windows Task Scheduler (weekly)

Program/script:

- `npm`

Arguments:

- `run rank:weekly -- --siteUrl https://www.convert-craft.com/`

Start in:

- workspace root (`C:\Users\Administrator\Desktop\convertcraft-v10`)

### Linux cron (weekly example)

```bash
0 8 * * 1 cd /path/to/convertcraft-v10 && npm run rank:weekly -- --siteUrl https://www.convert-craft.com/ >> rank-reports/cron.log 2>&1
```

### GitHub Actions (weekly)

Use a scheduled workflow (`cron`) that runs:

```bash
npm ci
npm run rank:weekly -- --siteUrl https://www.convert-craft.com/
```

Implemented workflow:

- `.github/workflows/weekly-rank-report.yml`

Required repository secrets:

- `GSC_SERVICE_ACCOUNT_KEY` (full JSON of the service account key)

Optional repository secret:

- `GSC_SITE_URL` (defaults to `https://www.convert-craft.com/` if omitted)

The workflow writes the secret to `./gsc-key.json` at runtime, runs:

```bash
npm run rank:weekly -- --days 28 --key ./gsc-key.json --siteUrl <site-url> --top 10 --minImpressions 1 --opportunityCtr 0.05
```

It then uploads `rank-reports/` as an artifact named like:

- `weekly-rank-report-YYYYMMDD`

The weekly workflow can also generate CTR opportunities from the latest snapshot.
If enabled, CTR artifacts are written into `rank-reports/` and included in the same uploaded artifact.

Manual test:

1. Go to GitHub Actions.
2. Select `Weekly Rank Report`.
3. Click `Run workflow`.
4. Download the artifact and open the generated markdown report.

## Snapshot schema (high-level)

- `property`
- `request.startDate`, `request.endDate`, `request.dimensions`
- `summary.rowCount`, `summary.clicks`, `summary.impressions`, `summary.ctr`, `summary.avgPosition`
- `rows[]` with:
  - `dimensions.query`
  - `dimensions.page`
  - `dimensions.device`
  - `dimensions.country`
  - `dimensions.date`
  - `clicks`, `impressions`, `ctr`, `position`

## Diff report output

The report includes:

- Top gaining keywords (position gain)
- Top losing keywords
- Top gaining pages
- Top losing pages
- Opportunity keywords: high impressions + low CTR

## Notes

- For very large properties, keep `--maxRows` capped initially and scale up gradually.
- Position gain is calculated as `oldPosition - newPosition` (positive = improved ranking).
- This baseline is intended to unlock weekly monitoring, CTR experiments, and content-gap prioritization.
