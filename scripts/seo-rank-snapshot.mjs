#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const WEBMASTERS_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getDateRange({ days, startDate, endDate }) {
  const explicitStart = toIsoDate(startDate);
  const explicitEnd = toIsoDate(endDate);

  if (explicitStart && explicitEnd) {
    if (explicitStart > explicitEnd) {
      throw new Error(`Invalid date range: startDate (${explicitStart}) is after endDate (${explicitEnd}).`);
    }
    return { startDate: explicitStart, endDate: explicitEnd, source: 'explicit' };
  }

  const rangeDays = Number(days);
  if (!Number.isFinite(rangeDays) || rangeDays <= 0) {
    throw new Error(`Invalid --days value: ${days}`);
  }

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    source: 'relative'
  };
}

function parseDimensions(raw) {
  const value = String(raw || 'query,page,device,country,date')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const allowed = new Set(['query', 'page', 'device', 'country', 'date']);
  const invalid = value.filter((dim) => !allowed.has(dim));
  if (invalid.length) {
    throw new Error(`Invalid dimensions: ${invalid.join(', ')}. Allowed: query,page,device,country,date`);
  }

  if (!value.length) {
    throw new Error('At least one dimension is required.');
  }

  return Array.from(new Set(value));
}

function resolveCredentials({ keyFile, saJsonRaw }) {
  const envKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GSC_SA_KEY_PATH || process.env.GSC_KEY;
  const selectedKeyFile = keyFile || envKeyFile;

  const inlineRaw = saJsonRaw || process.env.GSC_SA_KEY || '';
  if (inlineRaw) {
    try {
      return { credentials: JSON.parse(inlineRaw), keyFile: null };
    } catch (error) {
      throw new Error(`Failed to parse service account JSON from --saJson/GSC_SA_KEY: ${error.message}`);
    }
  }

  if (!selectedKeyFile) {
    throw new Error('Missing credentials. Provide --key=... or set GOOGLE_APPLICATION_CREDENTIALS / GSC_SA_KEY_PATH, or use --saJson / GSC_SA_KEY.');
  }

  return { credentials: null, keyFile: selectedKeyFile };
}

function siteSlug(siteUrl) {
  return String(siteUrl || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'site';
}

function aggregateTotals(rows) {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    const rowClicks = Number(row.clicks || 0);
    const rowImpressions = Number(row.impressions || 0);
    const rowPosition = Number(row.position || 0);

    clicks += rowClicks;
    impressions += rowImpressions;
    weightedPosition += rowPosition * (rowImpressions > 0 ? rowImpressions : 1);
  }

  const avgCtr = impressions > 0 ? clicks / impressions : 0;
  const avgPosition = rows.length ? (weightedPosition / rows.reduce((sum, row) => sum + (Number(row.impressions || 0) > 0 ? Number(row.impressions || 0) : 1), 0)) : 0;

  return {
    clicks,
    impressions,
    ctr: avgCtr,
    avgPosition
  };
}

async function fetchSearchAnalyticsRows({ webmasters, siteUrl, startDate, endDate, dimensions, rowLimit, maxRows, searchType }) {
  const rows = [];
  let startRow = 0;

  while (rows.length < maxRows) {
    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow,
        type: searchType
      }
    });

    const batch = response?.data?.rows || [];
    if (!batch.length) break;

    for (const row of batch) {
      const keys = Array.isArray(row.keys) ? row.keys : [];
      const dimValues = {};
      dimensions.forEach((dim, index) => {
        dimValues[dim] = keys[index] ?? null;
      });

      rows.push({
        keys,
        dimensions: dimValues,
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0)
      });

      if (rows.length >= maxRows) break;
    }

    if (batch.length < rowLimit || rows.length >= maxRows) break;
    startRow += batch.length;
  }

  return rows;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('key', { type: 'string', describe: 'Path to service account JSON key file' })
    .option('saJson', { type: 'string', describe: 'Inline service account JSON (discouraged in shell history)' })
    .option('siteUrl', { type: 'string', default: process.env.GSC_SITE_URL || 'sc-domain:convert-craft.com', describe: 'Search Console property (e.g., sc-domain:convert-craft.com)' })
    .option('days', { type: 'number', default: 28, describe: 'Relative lookback window when start/end are omitted' })
    .option('startDate', { type: 'string', describe: 'Start date in YYYY-MM-DD' })
    .option('endDate', { type: 'string', describe: 'End date in YYYY-MM-DD' })
    .option('dimensions', { type: 'string', default: 'query,page,device,country,date', describe: 'Comma-separated dimensions' })
    .option('rowLimit', { type: 'number', default: 25000, describe: 'Rows per API request (max 25000)' })
    .option('maxRows', { type: 'number', default: 500000, describe: 'Hard cap for total rows fetched' })
    .option('searchType', { type: 'string', default: 'web', describe: 'Search type: web | image | video | news | discover | googleNews' })
    .option('dataDir', { type: 'string', default: path.join('data', 'rank-snapshots'), describe: 'Output directory for snapshots' })
    .option('tag', { type: 'string', default: '', describe: 'Optional suffix tag for filename' })
    .strict()
    .help()
    .parse();

  const dimensions = parseDimensions(argv.dimensions);
  const rowLimit = Math.min(25000, Math.max(1, Number(argv.rowLimit)));
  const maxRows = Math.max(1, Number(argv.maxRows));
  const { startDate, endDate, source } = getDateRange(argv);
  const { credentials, keyFile } = resolveCredentials({ keyFile: argv.key, saJsonRaw: argv.saJson });

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFile || undefined,
    credentials: credentials || undefined,
    scopes: [WEBMASTERS_SCOPE]
  });

  const webmasters = google.webmasters({ version: 'v3', auth });

  const rows = await fetchSearchAnalyticsRows({
    webmasters,
    siteUrl: argv.siteUrl,
    startDate,
    endDate,
    dimensions,
    rowLimit,
    maxRows,
    searchType: argv.searchType
  });

  const totals = aggregateTotals(rows);
  const generatedAt = new Date().toISOString();

  const snapshot = {
    version: 1,
    generatedAt,
    property: argv.siteUrl,
    request: {
      startDate,
      endDate,
      dateRangeSource: source,
      dimensions,
      rowLimit,
      maxRows,
      searchType: argv.searchType
    },
    summary: {
      rowCount: rows.length,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.ctr,
      avgPosition: totals.avgPosition
    },
    rows
  };

  await fs.mkdir(argv.dataDir, { recursive: true });

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const tag = argv.tag ? `-${String(argv.tag).replace(/[^a-z0-9_-]/gi, '-')}` : '';
  const fileName = `rank-snapshot-${siteSlug(argv.siteUrl)}-${startDate}-to-${endDate}-${stamp}${tag}.json`;
  const filePath = path.join(argv.dataDir, fileName);

  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const latestPath = path.join(argv.dataDir, 'latest-rank-snapshot.json');
  await fs.writeFile(latestPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log('Rank snapshot created.');
  console.log(`property=${argv.siteUrl}`);
  console.log(`range=${startDate}..${endDate} (${source})`);
  console.log(`dimensions=${dimensions.join(',')}`);
  console.log(`rows=${rows.length} clicks=${totals.clicks.toFixed(0)} impressions=${totals.impressions.toFixed(0)} ctr=${(totals.ctr * 100).toFixed(2)}% avgPosition=${totals.avgPosition.toFixed(2)}`);
  console.log(`snapshot=${filePath}`);
  console.log(`latest=${latestPath}`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
