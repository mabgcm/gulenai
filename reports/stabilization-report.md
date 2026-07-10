# Stabilization Report

Generated: 2026-07-10T01:14:00Z

## Bugs fixed

- Crawler resume now continues from `data/crawl/state.json` when the saved queue is non-empty. `CRAWL_MAX_PAGES` is applied per invocation instead of against lifetime saved pages.
- Filesystem-heavy readers and writers now use bounded concurrency via `FS_CONCURRENCY` with a default of `32`.
- URL discovery now rejects obvious low-value infrastructure, pagination, tracking, and click/banner URLs before enqueue.
- Book/table-of-contents landing pages now prioritize chapter/article links from content regions.
- `pnpm diagnose` now reports queue size, resume status, remaining URLs, filesystem concurrency, pending/active filesystem jobs, open-handle statistics, and memory usage.
- Pipeline throughput is written to `reports/performance.html` and `reports/performance.json`.

## Performance and scalability

- Regression coverage includes indexing 1,000 documents / 10,000 chunks with bounded filesystem concurrency.
- Real local dataset validation indexed 1,001 documents / 12,661 chunks without EMFILE.
- Measured throughput:
  - Crawl: 0.41 pages/sec for a single resume pass.
  - Index: 7,863.98 chunks/sec for 12,661 chunks.
  - Embed: 16.25 vectors/sec for the large successful embedding pass.
  - Qdrant: 390.53 vectors/sec.

## Validation

- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed, 111 tests.
- Pipeline commands run: `crawl`, `extract`, `markdown`, `chunk`, `index`, `embed --resume`, `qdrant --resume`, `diagnose`, `validate-search`, `answer`.

## Remaining known issues

- 320 chunks remain pending because OpenAI rejected them as over the 8192-token embedding input limit. This is not an EMFILE issue and was not changed in this stabilization sprint.
- Qdrant diagnostics show 3 orphan vectors in the remote collection.
- Crawl remains resumable with 993 queued URLs after the validation pass.
