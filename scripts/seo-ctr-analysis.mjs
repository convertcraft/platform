#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toPct(value) {
  return `${(asNumber(value) * 100).toFixed(2)}%`;
}

function formatNum(value) {
  return asNumber(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function escapeMdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLatestSnapshotPath(files) {
  return files
    .filter((name) => /^rank-snapshot-.*\.json$/i.test(name))
    .sort()
    .pop() || null;
}

async function resolveSnapshotPath({ snapshot, snapshotDir }) {
  if (snapshot) return snapshot;

  const latestPath = path.join(snapshotDir, 'latest-rank-snapshot.json');
  try {
    await fs.access(latestPath);
    return latestPath;
  } catch {
    // fallback to latest dated file
  }

  const names = await fs.readdir(snapshotDir);
  const latestName = pickLatestSnapshotPath(names);
  if (!latestName) {
    throw new Error(`No rank snapshot found in ${snapshotDir}`);
  }

  return path.join(snapshotDir, latestName);
}

function keywordFromPage(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const parts = url.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    const lastPart = parts.length ? parts[parts.length - 1] : 'convertcraft';
    return lastPart
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return 'ConvertCraft';
  }
}

function suggestionFor({ page, topQuery }) {
  const primary = String(topQuery || keywordFromPage(page) || 'ConvertCraft').trim();
  const leading = primary.replace(/\s+/g, ' ').trim();
  const title = `${leading} – Fast, Free Online Tool | ConvertCraft`.slice(0, 66);
  const meta = `Use ConvertCraft for ${leading.toLowerCase()} in seconds. Free, secure, browser-based workflow with no installation.`.slice(0, 158);

  return {
    suggestedTitle: title,
    suggestedMeta: meta,
    recommendation: 'Front-load primary query, add benefit (fast/free), keep intent-specific wording, and keep title/meta within SERP-friendly length.'
  };
}

async function fetchTitle(url, timeoutMs) {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ConvertCraft-CTR-Bot/1.0)'
      }
    });
    clearTimeout(timer);

    const html = await response.text();
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    return decodeHtml(titleMatch?.[1] || '');
  } catch {
    return '';
  }
}

function buildMarkdownReport({ snapshotPath, summary, opportunities }) {
  const lines = [
    '# CTR Opportunities Report',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Snapshot: ${snapshotPath}`,
    `- Property: ${summary.property}`,
    `- Range: ${summary.startDate} .. ${summary.endDate}`,
    `- Filters: impressions >= ${summary.minImpressions}, ctr <= ${toPct(summary.maxCtr)}`,
    `- Opportunities: ${opportunities.length}`,
    '',
    '| Page | Current Title | Impressions | Clicks | CTR | Avg Position | Top Query | Suggested Title | Suggested Meta | Recommendation |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |'
  ];

  for (const item of opportunities) {
    lines.push(
      `| ${escapeMdCell(item.page)} | ${escapeMdCell(item.currentTitle || '(not fetched)')} | ${formatNum(item.impressions)} | ${formatNum(item.clicks)} | ${toPct(item.ctr)} | ${formatNum(item.avgPosition)} | ${escapeMdCell(item.topQuery)} | ${escapeMdCell(item.suggestedTitle)} | ${escapeMdCell(item.suggestedMeta)} | ${escapeMdCell(item.recommendation)} |`
    );
  }

  if (!opportunities.length) {
    lines.push('| _none_ | _none_ | 0 | 0 | 0.00% | 0 | _none_ | _none_ | _none_ | _none_ |');
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildCsv(opportunities) {
  const headers = [
    'page',
    'current_title',
    'impressions',
    'clicks',
    'ctr',
    'avg_position',
    'top_query',
    'suggested_title',
    'suggested_meta',
    'recommendation'
  ];

  const rows = opportunities.map((item) => [
    item.page,
    item.currentTitle || '',
    item.impressions,
    item.clicks,
    item.ctr,
    item.avgPosition,
    item.topQuery,
    item.suggestedTitle,
    item.suggestedMeta,
    item.recommendation
  ]);

  return `${[headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('snapshot', { type: 'string', describe: 'Path to snapshot JSON (defaults to latest-rank-snapshot.json)' })
    .option('snapshotDir', { type: 'string', default: path.join('data', 'rank-snapshots'), describe: 'Directory containing rank snapshots' })
    .option('minImpressions', { type: 'number', default: 500, describe: 'Minimum impressions for opportunity rows' })
    .option('maxCtr', { type: 'number', default: 0.02, describe: 'Maximum CTR threshold (decimal)' })
    .option('top', { type: 'number', default: 30, describe: 'Maximum number of opportunities in report' })
    .option('fetchTitles', { type: 'boolean', default: true, describe: 'Fetch live page titles for report' })
    .option('titleTimeoutMs', { type: 'number', default: 10000, describe: 'Timeout per title fetch in ms' })
    .option('out', { type: 'string', default: path.join('rank-reports', `ctr-opportunities-${new Date().toISOString().slice(0, 10)}.md`), describe: 'Markdown report output path' })
    .option('csvOut', { type: 'string', default: path.join('rank-reports', `ctr-opportunities-${new Date().toISOString().slice(0, 10)}.csv`), describe: 'CSV suggestions output path' })
    .strict()
    .help()
    .parse();

  const snapshotPath = await resolveSnapshotPath({ snapshot: argv.snapshot, snapshotDir: argv.snapshotDir });
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const snapshot = JSON.parse(raw);
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];

  if (!rows.length) {
    throw new Error(`Snapshot has no rows: ${snapshotPath}`);
  }

  const pageStats = new Map();
  for (const row of rows) {
    const page = String(row?.dimensions?.page || '').trim();
    if (!page) continue;

    const clicks = asNumber(row.clicks);
    const impressions = asNumber(row.impressions);
    const position = asNumber(row.position);
    const query = String(row?.dimensions?.query || '').trim();

    if (!pageStats.has(page)) {
      pageStats.set(page, {
        page,
        clicks: 0,
        impressions: 0,
        weightedPosition: 0,
        weight: 0,
        queryImpressions: new Map()
      });
    }

    const item = pageStats.get(page);
    const weight = impressions > 0 ? impressions : 1;

    item.clicks += clicks;
    item.impressions += impressions;
    item.weightedPosition += position * weight;
    item.weight += weight;

    if (query) {
      item.queryImpressions.set(query, (item.queryImpressions.get(query) || 0) + impressions);
    }
  }

  const candidates = [];
  for (const item of pageStats.values()) {
    const ctr = item.impressions > 0 ? item.clicks / item.impressions : 0;
    const avgPosition = item.weight > 0 ? item.weightedPosition / item.weight : 0;
    const topQuery = [...item.queryImpressions.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    candidates.push({
      page: item.page,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr,
      avgPosition,
      topQuery
    });
  }

  const opportunities = candidates
    .filter((item) => item.impressions >= argv.minImpressions && item.ctr <= argv.maxCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, Math.max(1, Number(argv.top)));

  for (const item of opportunities) {
    item.currentTitle = argv.fetchTitles ? await fetchTitle(item.page, Number(argv.titleTimeoutMs)) : '';
    const suggestion = suggestionFor(item);
    item.suggestedTitle = suggestion.suggestedTitle;
    item.suggestedMeta = suggestion.suggestedMeta;
    item.recommendation = suggestion.recommendation;
  }

  const summary = {
    property: snapshot?.property || 'unknown',
    startDate: snapshot?.request?.startDate || '?',
    endDate: snapshot?.request?.endDate || '?',
    minImpressions: Number(argv.minImpressions),
    maxCtr: Number(argv.maxCtr)
  };

  const md = buildMarkdownReport({ snapshotPath, summary, opportunities });
  const csv = buildCsv(opportunities);

  await fs.mkdir(path.dirname(argv.out), { recursive: true });
  await fs.writeFile(argv.out, md, 'utf8');

  await fs.mkdir(path.dirname(argv.csvOut), { recursive: true });
  await fs.writeFile(argv.csvOut, csv, 'utf8');

  console.log('CTR analysis complete.');
  console.log(`snapshot=${snapshotPath}`);
  console.log(`opportunities=${opportunities.length}`);
  console.log(`markdown=${argv.out}`);
  console.log(`csv=${argv.csvOut}`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
