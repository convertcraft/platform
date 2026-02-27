# CTR Optimization Workflow

This workflow uses rank snapshots to find high-impression pages with low CTR and generate title/meta suggestions.

## Deliverables

- `scripts/seo-ctr-analysis.mjs`
- `ctr-experiments-log.csv`
- `npm run ctr:analyze`

## Quick run

```bash
npm run ctr:analyze
```

Default outputs:

- `rank-reports/ctr-opportunities-YYYY-MM-DD.md`
- `rank-reports/ctr-opportunities-YYYY-MM-DD.csv`

## Useful options

```bash
npm run ctr:analyze -- --minImpressions 500 --maxCtr 0.02 --top 30
```

- `--snapshot <path>`: analyze a specific snapshot
- `--snapshotDir <dir>`: default `data/rank-snapshots`
- `--fetchTitles true|false`: fetch live titles from URLs
- `--out <path>`: markdown output path
- `--csvOut <path>`: csv output path

## Heuristic suggestions

For each opportunity page, the script proposes:

- Suggested title (primary query + clear benefit + brand)
- Suggested meta description (intent-focused, concise, action-oriented)
- Recommendation notes for optimization rationale

## Experiment tracking

Use `ctr-experiments-log.csv` to track rollout and impact over time.

Columns:

- `date`
- `page`
- `original_title`
- `new_title`
- `impressions_before`
- `impressions_after`
- `ctr_before`
- `ctr_after`
- `status` (`pending`, `live`, `reverted`)
- `notes`

## Suggested cadence

1. Run `rank:weekly`
2. Run `ctr:analyze`
3. Pick top 3-5 pages from opportunities
4. Update titles/meta
5. Log changes in `ctr-experiments-log.csv`
6. Compare impact after 2-4 weeks
