# GulenAI Ingestion

Production-oriented Node.js + TypeScript ingestion pipeline for building a knowledge base from published works. The completed increments implement the generic crawler for `https://fgulen.com`, content extraction from crawled raw HTML, and Markdown conversion; later increments will fill in chunking, embeddings, Qdrant indexing, and semantic search.

The architecture target is:

```text
Source -> Crawler -> Content Extractor -> Markdown Converter -> Chunker -> Embedding -> Qdrant -> LLM
```

## Current Status

Implemented:

- Generic source configuration via `.env`
- Queue-based breadth-first crawler
- Configurable max depth, max pages, concurrency, retries, and crawl delay
- Resume support through `data/crawl/state.json`
- `robots.txt` support, including crawl delay and sitemap hints
- `sitemap.xml` discovery, including nested sitemap indexes
- Canonical URL handling
- URL normalization and tracking parameter removal
- Duplicate detection
- Domain, include path, exclude path, and language filtering
- Raw HTML persistence under `data/raw`
- Crawl state, failures, visited URLs, and raw index persistence under `data/crawl`
- Content extraction from `data/raw`
- Boilerplate removal for navigation, headers, footers, sidebars, cookie banners, ads, newsletter popups, social sharing widgets, comments, breadcrumbs, pagination, and related-content blocks
- Main article detection using semantic selectors, with Mozilla Readability fallback
- Clean HTML persistence under `data/clean`, preserving the `data/raw` directory structure
- Per-document metadata sidecars with title, URL, language, author, published date, crawl date, content hash, reading time, and word count
- Markdown conversion from `data/clean`
- AI-friendly Markdown normalization for headings, whitespace, line endings, URLs, Unicode, images, lists, blockquotes, tables, and horizontal rules
- Markdown persistence under `data/markdown`, preserving the `data/clean` directory structure
- Metadata sidecar copying alongside generated Markdown files
- Pino logging, Zod config validation, strict TypeScript, ESLint, Prettier
- Unit tests for URL policy, HTML parsing, crawler behavior, content extraction, metadata, Markdown conversion, and markdown chunking

Not yet implemented as CLI stages:

- `chunk`
- `embed`
- `index`
- `search`

The chunker module exists and is tested, but its CLI/data integration is intentionally left for the chunking stage.

## Requirements

- Node.js 22+
- pnpm
- Chromium browser for Playwright

If pnpm is not globally installed, use:

```bash
npx pnpm@9.15.4 install
```

Install Playwright's Chromium browser before a real crawl:

```bash
npx playwright install chromium
```

## Setup

```bash
cp .env.example .env
npx pnpm@9.15.4 install
```

Default crawl scope is restricted to `fgulen.com`:

```env
CRAWL_SEEDS=https://fgulen.com
CRAWL_ALLOWED_DOMAINS=fgulen.com
CRAWL_INCLUDE_PATHS=/
CRAWL_EXCLUDE_PATHS=/wp-admin,/wp-login.php,/search
CRAWL_MAX_PAGES=1000
CRAWL_MAX_DEPTH=4
CRAWL_CONCURRENCY=3
CRAWL_RETRIES=2
CRAWL_DELAY_MS=1000
CRAWL_RESPECT_ROBOTS=true
```

To add another website later, change the seed, allowed domains, and path filters. The crawler does not contain `fgulen.com`-specific logic.

## Commands

```bash
pnpm crawl
pnpm reset
pnpm extract
pnpm markdown
pnpm chunk
pnpm embed
pnpm index
pnpm search
```

`crawl`, `extract`, `markdown`, and `reset` are implemented. The other commands are registered so the CLI shape is stable, and they fail clearly until their stages are implemented.

## Data Layout

```text
data/
  raw/         raw HTML pages
  clean/       cleaned article HTML and .metadata.json sidecars
  markdown/    markdown documents and copied .metadata.json sidecars
  chunks/      chunk JSON, future stage
  crawl/
    state.json
    visited.txt
    failures.json
    raw-index.jsonl
```

`raw-index.jsonl` contains one JSON record per saved page with URL, canonical URL, HTTP status, title, fetched timestamp, content hash, and raw file path.

For each raw HTML file, extraction writes:

```text
data/clean/<same-relative-path>.html
data/clean/<same-relative-path>.metadata.json
```

Metadata shape:

```json
{
  "title": "Article title",
  "url": "https://fgulen.com/example",
  "language": "en",
  "author": "Fethullah Gülen",
  "publishedDate": "2020-01-02T03:04:05.000Z",
  "crawlDate": "2026-07-09T00:00:00.000Z",
  "contentHash": "sha256",
  "estimatedReadingTime": 3,
  "wordCount": 650,
  "extractionMethod": "semantic"
}
```

For each clean HTML file, Markdown conversion writes:

```text
data/markdown/<same-relative-path>.md
data/markdown/<same-relative-path>.metadata.json
```

Markdown conversion preserves headings, paragraphs, emphasis, strong text, links, blockquotes, ordered and unordered lists, nested lists, tables, images with alt text, and horizontal rules. It removes invisible content, empty elements, redundant whitespace, and duplicated blank lines.

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

When pnpm is unavailable globally:

```bash
npx pnpm@9.15.4 typecheck
npx pnpm@9.15.4 lint
npx pnpm@9.15.4 test
```

## Extensibility

The source model is intentionally generic:

- Web pages through seed URLs and crawl policies
- Future RSS sources
- Future local folders
- Future PDF, EPUB, DOCX, and YouTube transcript sources

New sources should implement source-specific discovery/input adapters while preserving the shared downstream contracts: raw content, cleaned content, markdown, chunks, embeddings, and vector payload metadata.
