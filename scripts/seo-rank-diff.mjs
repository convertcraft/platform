#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeCtr(clicks, impressions) {
  return impressions > 0 ? clicks / impressions : 0;
}

async function readSnapshot(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.rows)) {
    throw new Error(`Invalid snapshot format: ${filePath}`);
  }
  return parsed;
}

async function pickLatestSnapshots(dirPath) {
  const files = await fs.readdir(dirPath);
  const candidates = files
    .filter((name) => /^rank-snapshot-.*\.json$/i.test(name))
    .map((name) => path.join(dirPath, name));

  if (candidates.length < 2) {
    throw new Error(`Need at least 2 snapshot files in ${dirPath}. Found ${candidates.length}.`);
  }

  const withStat = await Promise.all(candidates.map(async (filePath) => ({
    filePath,
    stat: await fs.stat(filePath)
  })));

  withStat.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  const older = withStat[withStat.length - 2].filePath;
  const newer = withStat[withStat.length - 1].filePath;
  return { older, newer };
}

function aggregateBy(rows, field) {
  const map = new Map();

  for (const row of rows) {
    const key = String(row?.dimensions?.[field] ?? '').trim();
    if (!key) continue;

    const clicks = asNumber(row.clicks);
    const impressions = asNumber(row.impressions);
    const position = asNumber(row.position);

    if (!map.has(key)) {
      map.set(key, {
        key,
        clicks: 0,
        impressions: 0,
        weightedPosition: 0,
        weight: 0
      });
    }

    const entry = map.get(key);
    const weight = impressions > 0 ? impressions : 1;

    entry.clicks += clicks;
    entry.impressions += impressions;
    entry.weightedPosition += position * weight;
    entry.weight += weight;
  }

  for (const entry of map.values()) {
    entry.ctr = safeCtr(entry.clicks, entry.impressions);
    entry.position = entry.weight > 0 ? entry.weightedPosition / entry.weight : 0;
  }

  return map;
}

function compareMaps(oldMap, newMap) {
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const output = [];

  for (const key of keys) {
    const prev = oldMap.get(key) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const curr = newMap.get(key) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    output.push({
      key,
      oldExists: oldMap.has(key),
      newExists: newMap.has(key),
      oldClicks: prev.clicks,
      newClicks: curr.clicks,
      deltaClicks: curr.clicks - prev.clicks,
      oldImpressions: prev.impressions,
      newImpressions: curr.impressions,
      deltaImpressions: curr.impressions - prev.impressions,
      oldCtr: prev.ctr,
      newCtr: curr.ctr,
      deltaCtr: curr.ctr - prev.ctr,
      oldPosition: prev.position,
      newPosition: curr.position,
      positionGain: prev.position - curr.position
    });
  }

  return output;
}

function snapshotEndDate(snapshot) {
  const raw = String(snapshot?.request?.endDate || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function topItems(rows, selector, top) {
  return [...rows]
    .sort(selector)
    .slice(0, top);
}

function formatPct(value) {
  return `${(asNumber(value) * 100).toFixed(2)}%`;
}

function formatNum(value) {
  return asNumber(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function toMdTable(items, columns) {
  if (!items.length) return '_none_';
  const header = `| ${columns.map((col) => col.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = items.map((item) => `| ${columns.map((col) => col.value(item)).join(' | ')} |`).join('\n');
  return `${header}\n${divider}\n${body}`;
}

function buildReport({ olderPath, newerPath, older, newer, top, minImpressions, opportunityCtr }) {
  const keywordOld = aggregateBy(older.rows, 'query');
  const keywordNew = aggregateBy(newer.rows, 'query');
  const pageOld = aggregateBy(older.rows, 'page');
  const pageNew = aggregateBy(newer.rows, 'page');

  const keywordDiffs = compareMaps(keywordOld, keywordNew);
  const pageDiffs = compareMaps(pageOld, pageNew);

  const comparableKeywords = keywordDiffs.filter((row) => row.oldExists && row.newExists && row.oldPosition > 0 && row.newPosition > 0);
  const comparablePages = pageDiffs.filter((row) => row.oldExists && row.newExists && row.oldPosition > 0 && row.newPosition > 0);

  const topKeywordGainers = topItems(comparableKeywords, (a, b) => b.positionGain - a.positionGain || b.deltaClicks - a.deltaClicks, top);
  const topKeywordLosers = topItems(comparableKeywords, (a, b) => a.positionGain - b.positionGain || a.deltaClicks - b.deltaClicks, top);

  const topPageGainers = topItems(comparablePages, (a, b) => b.positionGain - a.positionGain || b.deltaClicks - a.deltaClicks, top);
  const topPageLosers = topItems(comparablePages, (a, b) => a.positionGain - b.positionGain || a.deltaClicks - b.deltaClicks, top);

  const opportunities = [...keywordNew.values()]
    .filter((item) => item.impressions >= minImpressions && item.ctr <= opportunityCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, top);

  const olderSummary = older.summary || {};
  const newerSummary = newer.summary || {};

  const report = [
    '# SEO Rank Diff Report',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Older snapshot: ${olderPath}`,
    `- Newer snapshot: ${newerPath}`,
    `- Property: ${newer.property || older.property || 'unknown'}`,
    `- Older range: ${older.request?.startDate || '?'} .. ${older.request?.endDate || '?'}`,
    `- Newer range: ${newer.request?.startDate || '?'} .. ${newer.request?.endDate || '?'}`,
    '',
    '## Snapshot Summary',
    '',
    `- Older rows: ${formatNum(olderSummary.rowCount || older.rows.length)} | clicks: ${formatNum(olderSummary.clicks)} | impressions: ${formatNum(olderSummary.impressions)} | ctr: ${formatPct(olderSummary.ctr)} | avgPosition: ${formatNum(olderSummary.avgPosition)}`,
    `- Newer rows: ${formatNum(newerSummary.rowCount || newer.rows.length)} | clicks: ${formatNum(newerSummary.clicks)} | impressions: ${formatNum(newerSummary.impressions)} | ctr: ${formatPct(newerSummary.ctr)} | avgPosition: ${formatNum(newerSummary.avgPosition)}`,
    '',
    '## Top Gaining Keywords (by position gain)',
    '',
    toMdTable(topKeywordGainers, [
      { label: 'Keyword', value: (r) => r.key.replace(/\|/g, '\\|') },
      { label: 'Pos Gain', value: (r) => formatNum(r.positionGain) },
      { label: 'Old Pos', value: (r) => formatNum(r.oldPosition) },
      { label: 'New Pos', value: (r) => formatNum(r.newPosition) },
      { label: 'Δ Clicks', value: (r) => formatNum(r.deltaClicks) },
      { label: 'Δ Impr', value: (r) => formatNum(r.deltaImpressions) }
    ]),
    '',
    '## Top Losing Keywords (by position drop)',
    '',
    toMdTable(topKeywordLosers, [
      { label: 'Keyword', value: (r) => r.key.replace(/\|/g, '\\|') },
      { label: 'Pos Gain', value: (r) => formatNum(r.positionGain) },
      { label: 'Old Pos', value: (r) => formatNum(r.oldPosition) },
      { label: 'New Pos', value: (r) => formatNum(r.newPosition) },
      { label: 'Δ Clicks', value: (r) => formatNum(r.deltaClicks) },
      { label: 'Δ Impr', value: (r) => formatNum(r.deltaImpressions) }
    ]),
    '',
    '## Top Gaining Pages',
    '',
    toMdTable(topPageGainers, [
      { label: 'Page', value: (r) => r.key.replace(/\|/g, '\\|') },
      { label: 'Pos Gain', value: (r) => formatNum(r.positionGain) },
      { label: 'Old Pos', value: (r) => formatNum(r.oldPosition) },
      { label: 'New Pos', value: (r) => formatNum(r.newPosition) },
      { label: 'Δ Clicks', value: (r) => formatNum(r.deltaClicks) },
      { label: 'Δ Impr', value: (r) => formatNum(r.deltaImpressions) }
    ]),
    '',
    '## Top Losing Pages',
    '',
    toMdTable(topPageLosers, [
      { label: 'Page', value: (r) => r.key.replace(/\|/g, '\\|') },
      { label: 'Pos Gain', value: (r) => formatNum(r.positionGain) },
      { label: 'Old Pos', value: (r) => formatNum(r.oldPosition) },
      { label: 'New Pos', value: (r) => formatNum(r.newPosition) },
      { label: 'Δ Clicks', value: (r) => formatNum(r.deltaClicks) },
      { label: 'Δ Impr', value: (r) => formatNum(r.deltaImpressions) }
    ]),
    '',
    '## Keyword Opportunities (high impressions, low CTR)',
    '',
    `- Filters: impressions >= ${minImpressions}, ctr <= ${formatPct(opportunityCtr)}`,
    '',
    toMdTable(opportunities, [
      { label: 'Keyword', value: (r) => r.key.replace(/\|/g, '\\|') },
      { label: 'Impressions', value: (r) => formatNum(r.impressions) },
      { label: 'Clicks', value: (r) => formatNum(r.clicks) },
      { label: 'CTR', value: (r) => formatPct(r.ctr) },
      { label: 'Avg Position', value: (r) => formatNum(r.position) }
    ]),
    ''
  ].join('\n');

  return {
    report,
    stats: {
      keywordsCompared: keywordDiffs.length,
      pagesCompared: pageDiffs.length,
      opportunities: opportunities.length
    }
  };
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('snap1', { type: 'string', describe: 'Older snapshot file path' })
    .option('snap2', { type: 'string', describe: 'Newer snapshot file path' })
    .option('latest', { type: 'boolean', default: false, describe: 'Use latest 2 snapshots from --dir' })
    .option('dir', { type: 'string', default: path.join('data', 'rank-snapshots'), describe: 'Snapshot directory for --latest mode' })
    .option('top', { type: 'number', default: 20, describe: 'Top N rows per section' })
    .option('minImpressions', { type: 'number', default: 500, describe: 'Minimum impressions for opportunities' })
    .option('opportunityCtr', { type: 'number', default: 0.015, describe: 'Maximum CTR threshold for opportunities (decimal)' })
    .option('out', { type: 'string', describe: 'Optional markdown output path' })
    .strict()
    .help()
    .parse();

  let olderPath = argv.snap1;
  let newerPath = argv.snap2;

  if (argv.latest) {
    const latest = await pickLatestSnapshots(argv.dir);
    olderPath = latest.older;
    newerPath = latest.newer;
  }

  if (!olderPath || !newerPath) {
    throw new Error('Provide --snap1 and --snap2, or use --latest with --dir.');
  }

  let [older, newer] = await Promise.all([readSnapshot(olderPath), readSnapshot(newerPath)]);
  const olderEnd = snapshotEndDate(older);
  const newerEnd = snapshotEndDate(newer);
  if (olderEnd && newerEnd && olderEnd > newerEnd) {
    const swapPath = olderPath;
    olderPath = newerPath;
    newerPath = swapPath;
    const swapSnap = older;
    older = newer;
    newer = swapSnap;
  }

  const { report, stats } = buildReport({
    olderPath,
    newerPath,
    older,
    newer,
    top: Math.max(1, Number(argv.top)),
    minImpressions: Math.max(1, Number(argv.minImpressions)),
    opportunityCtr: Math.max(0, Number(argv.opportunityCtr))
  });

  if (argv.out) {
    await fs.mkdir(path.dirname(argv.out), { recursive: true });
    await fs.writeFile(argv.out, `${report}\n`, 'utf8');
  }

  console.log(report);
  console.log(`Compared keywords=${stats.keywordsCompared} pages=${stats.pagesCompared} opportunities=${stats.opportunities}`);
  if (argv.out) {
    console.log(`Report written: ${argv.out}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
