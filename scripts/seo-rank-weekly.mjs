#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(isoDate, daysDelta) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  date.setUTCDate(date.getUTCDate() + Number(daysDelta));
  return date.toISOString().slice(0, 10);
}

function computeRanges({ days, endDate }) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --days: ${days}`);
  }

  const effectiveEnd = toIsoDate(endDate) || (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const currentEnd = effectiveEnd;
  const currentStart = shiftIsoDate(currentEnd, -(n - 1));
  const prevEnd = shiftIsoDate(currentStart, -1);
  const prevStart = shiftIsoDate(prevEnd, -(n - 1));

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: prevStart, end: prevEnd }
  };
}

function runNodeScript(scriptRelPath, args, { allowFailure = false } = {}) {
  const scriptAbsPath = path.join(process.cwd(), scriptRelPath);
  const result = spawnSync(process.execPath, [scriptAbsPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();

  if (result.status !== 0 && !allowFailure) {
    const detail = [
      `Script failed: ${scriptRelPath}`,
      `exitCode=${result.status}`,
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : ''
    ].filter(Boolean).join('\n');
    throw new Error(detail);
  }

  return {
    ok: result.status === 0,
    status: result.status,
    stdout,
    stderr
  };
}

function extractSnapshotPath(outputText) {
  const match = String(outputText || '').match(/snapshot=([^\r\n]+)/i);
  return match?.[1]?.trim() || null;
}

async function readSnapshotSummary(snapshotPath) {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const data = JSON.parse(raw);
  return {
    property: data?.property || 'unknown',
    startDate: data?.request?.startDate || '?',
    endDate: data?.request?.endDate || '?',
    rowCount: Number(data?.summary?.rowCount || data?.rows?.length || 0),
    clicks: Number(data?.summary?.clicks || 0),
    impressions: Number(data?.summary?.impressions || 0),
    ctr: Number(data?.summary?.ctr || 0),
    avgPosition: Number(data?.summary?.avgPosition || 0)
  };
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

async function writeBaselineReport({ reportPath, generatedAt, currentSummary, note }) {
  const content = [
    '# Weekly SEO Rank Report (Baseline)',
    '',
    `- Generated: ${generatedAt}`,
    `- Property: ${currentSummary.property}`,
    `- Current range: ${currentSummary.startDate} .. ${currentSummary.endDate}`,
    '',
    '## Current Snapshot Summary',
    '',
    `- Rows: ${fmtNumber(currentSummary.rowCount)}`,
    `- Clicks: ${fmtNumber(currentSummary.clicks)}`,
    `- Impressions: ${fmtNumber(currentSummary.impressions)}`,
    `- CTR: ${fmtPct(currentSummary.ctr)}`,
    `- Avg Position: ${fmtNumber(currentSummary.avgPosition)}`,
    '',
    '## Notes',
    '',
    `- ${note}`,
    '- Weekly diff sections will appear after both periods are available.',
    ''
  ].join('\n');

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, content, 'utf8');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('days', { type: 'number', default: 28, describe: 'Window size for each period' })
    .option('endDate', { type: 'string', describe: 'Current period end date (YYYY-MM-DD), defaults to yesterday UTC' })
    .option('siteUrl', { type: 'string', default: process.env.GSC_SITE_URL || 'https://www.convert-craft.com/', describe: 'GSC property URL/domain' })
    .option('key', { type: 'string', describe: 'Path to service account key file' })
    .option('saJson', { type: 'string', describe: 'Inline service account JSON (or set GSC_SA_KEY env)' })
    .option('dataDir', { type: 'string', default: path.join('data', 'rank-snapshots'), describe: 'Snapshot storage directory' })
    .option('reportDir', { type: 'string', default: 'rank-reports', describe: 'Weekly report output directory' })
    .option('top', { type: 'number', default: 10, describe: 'Top rows in gain/loss sections' })
    .option('minImpressions', { type: 'number', default: 500, describe: 'Min impressions for opportunities' })
    .option('opportunityCtr', { type: 'number', default: 0.015, describe: 'Max CTR threshold for opportunities' })
    .strict()
    .help()
    .parse();

  const ranges = computeRanges({ days: argv.days, endDate: argv.endDate });
  const generatedAt = new Date().toISOString();
  const reportPath = path.join(argv.reportDir, `${todayIso()}-weekly-report.md`);

  console.log('Running weekly rank automation...');
  console.log(`property=${argv.siteUrl}`);
  console.log(`current=${ranges.current.start}..${ranges.current.end}`);
  console.log(`previous=${ranges.previous.start}..${ranges.previous.end}`);

  const sharedFetchArgs = [
    '--siteUrl', argv.siteUrl,
    '--dataDir', argv.dataDir
  ];

  if (argv.key) {
    sharedFetchArgs.push('--key', argv.key);
  }
  if (argv.saJson) {
    sharedFetchArgs.push('--saJson', argv.saJson);
  }

  const currentFetch = runNodeScript('scripts/seo-rank-snapshot.mjs', [
    '--startDate', ranges.current.start,
    '--endDate', ranges.current.end,
    '--tag', 'weekly-current',
    ...sharedFetchArgs
  ]);

  const currentSnapshot = extractSnapshotPath(currentFetch.stdout);
  if (!currentSnapshot) {
    throw new Error(`Could not parse current snapshot path from snapshot script output.\n${currentFetch.stdout}`);
  }

  const prevFetch = runNodeScript('scripts/seo-rank-snapshot.mjs', [
    '--startDate', ranges.previous.start,
    '--endDate', ranges.previous.end,
    '--tag', 'weekly-previous',
    ...sharedFetchArgs
  ], { allowFailure: true });

  const previousSnapshot = extractSnapshotPath(prevFetch.stdout);

  if (prevFetch.ok && previousSnapshot) {
    const diffArgs = [
      '--snap1', previousSnapshot,
      '--snap2', currentSnapshot,
      '--top', String(Math.max(1, Number(argv.top))),
      '--minImpressions', String(Math.max(1, Number(argv.minImpressions))),
      '--opportunityCtr', String(Math.max(0, Number(argv.opportunityCtr))),
      '--out', reportPath
    ];

    const diffRun = runNodeScript('scripts/seo-rank-diff.mjs', diffArgs);

    console.log('Weekly report generated with comparison.');
    console.log(`currentSnapshot=${currentSnapshot}`);
    console.log(`previousSnapshot=${previousSnapshot}`);
    console.log(`report=${reportPath}`);
    if (diffRun.stdout) {
      console.log(diffRun.stdout);
    }
    return;
  }

  const currentSummary = await readSnapshotSummary(currentSnapshot);
  const failNote = prevFetch.stderr || prevFetch.stdout || 'Previous-period snapshot unavailable.';
  await writeBaselineReport({
    reportPath,
    generatedAt,
    currentSummary,
    note: `Previous period snapshot could not be generated automatically. ${failNote}`
  });

  console.log('Weekly baseline report generated (no comparison).');
  console.log(`currentSnapshot=${currentSnapshot}`);
  console.log(`report=${reportPath}`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
