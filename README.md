# GulenAI Ingestion

Production-oriented Node.js + TypeScript ingestion pipeline for building a knowledge base from published works. The completed increments implement the generic crawler for `https://fgulen.com`, content extraction from crawled raw HTML, Markdown conversion, intelligent chunking, document indexing, embedding generation, and Qdrant vector-store synchronization; later increments will fill in semantic search.

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
- Intelligent Markdown chunking from `data/markdown`
- OpenAI-compatible token counting using `cl100k_base`
- Semantic chunk boundaries that preserve headings, paragraphs, blockquotes, ordered and unordered lists, nested lists, tables, and fenced code blocks
- Deterministic chunk IDs and JSON chunk persistence under `data/chunks`
- Document and chunk manifests under `data/index`
- Change detection for new, unchanged, changed, and deleted documents
- Chunk-level embedding status tracking so future embedding jobs can process only pending chunks
- OpenAI embedding generation for pending chunks only
- Batched, concurrent embedding jobs with exponential backoff, rate-limit retry handling, resume support, progress reporting, and temporary vector files under `data/embeddings`
- Qdrant collection creation, vector uploads, deletion synchronization, resumable sync, retry handling, and vector status reporting
- Pino logging, Zod config validation, strict TypeScript, ESLint, Prettier
- Unit tests for URL policy, HTML parsing, crawler behavior, content extraction, metadata, Markdown conversion, intelligent chunking, document indexing, embedding jobs, and Qdrant sync

Not yet implemented as CLI stages:

- `search`

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
CHUNK_SIZE_TOKENS=800
CHUNK_MAX_TOKENS=1000
CHUNK_OVERLAP_TOKENS=150
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_BATCH_SIZE=64
EMBEDDING_CONCURRENCY=2
EMBEDDING_RETRIES=3
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=fgulen
QDRANT_BATCH_SIZE=64
QDRANT_CONCURRENCY=2
QDRANT_RETRIES=3
```

To add another website later, change the seed, allowed domains, and path filters. The crawler does not contain `fgulen.com`-specific logic.

## Commands

```bash
pnpm crawl
pnpm reset
pnpm extract
pnpm markdown
pnpm chunk
pnpm index
pnpm status
pnpm embed
pnpm embed --resume
pnpm qdrant
pnpm qdrant --resume
pnpm qdrant status
pnpm search
```

`crawl`, `extract`, `markdown`, `chunk`, `index`, `status`, `embed`, `qdrant`, and `reset` are implemented. The other commands are registered so the CLI shape is stable, and they fail clearly until their stages are implemented.

## Data Layout

```text
data/
  raw/         raw HTML pages
  clean/       cleaned article HTML and .metadata.json sidecars
  markdown/    markdown documents and copied .metadata.json sidecars
  chunks/      semantic chunk JSON files
  index/       document and chunk manifests
  embeddings/  temporary embedding vector JSON files
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

For each Markdown file, chunking writes one JSON file per chunk:

```text
data/chunks/<same-relative-path-without-md>/<chunk-index>-<chunk-id>.json
```

Chunk JSON shape:

```json
{
  "metadata": {
    "id": "deterministic-id",
    "sourceFile": "en/article.md",
    "title": "Article title",
    "url": "https://fgulen.com/example",
    "language": "en",
    "headingPath": ["Book", "Chapter", "Section"],
    "chunkIndex": 0,
    "totalChunks": 5,
    "tokenCount": 782,
    "wordCount": 560,
    "contentHash": "sha256"
  },
  "markdown": "# Section\n\nChunk Markdown",
  "plainText": "Section\n\nChunk plain text"
}
```

Default chunking targets 800 tokens, allows up to 1000 tokens, and carries 150 tokens of block-level overlap when possible.

Document indexing reads chunk JSON files and writes:

```text
data/index/documents.json
data/index/chunks.json
data/index/summary.json
```

Document manifest entries contain:

```json
{
  "documentId": "deterministic-document-id",
  "sourceFile": "en/article.md",
  "url": "https://fgulen.com/example",
  "title": "Article title",
  "language": "en",
  "crawlDate": "2026-07-09T00:00:00.000Z",
  "contentHash": "sha256",
  "totalChunks": 5,
  "version": 2,
  "status": "changed",
  "lastIndexedAt": "2026-07-09T01:02:03.000Z"
}
```

Chunk manifest entries contain:

```json
{
  "chunkId": "deterministic-chunk-id",
  "documentId": "deterministic-document-id",
  "chunkIndex": 0,
  "tokenCount": 782,
  "contentHash": "sha256",
  "embeddingStatus": "pending",
  "embeddedAt": null,
  "embeddingModel": null,
  "embeddingDimensions": null,
  "vectorId": null
}
```

`pnpm status` prints the latest index summary:

```text
Documents: 1428
Chunks: 24562
Pending embeddings: 37
Changed documents: 5
Deleted documents: 1
```

Embedding reads `data/index/chunks.json`, loads only chunks marked `pending`, and writes one vector file per chunk:

```text
data/embeddings/<chunk-id>.json
```

Embedding vector files contain:

```json
{
  "chunkId": "deterministic-chunk-id",
  "contentHash": "sha256",
  "model": "text-embedding-3-small",
  "dimensions": 1536,
  "embedding": [0.01, -0.02],
  "embeddedAt": "2026-07-09T01:02:03.000Z"
}
```

After each successful batch, `data/index/chunks.json` is updated with `embeddingStatus`, `embeddedAt`, `embeddingModel`, `embeddingDimensions`, and `vectorId: null`. `pnpm embed --resume` reuses matching vector files when an interrupted job already wrote embeddings for the same chunk hash and model.

Progress is printed during embedding:

```text
Pending chunks: 542
Completed: 421
Remaining: 121
```

Qdrant sync reads `data/embeddings`, `data/chunks`, and `data/index/chunks.json`. It automatically creates `QDRANT_COLLECTION` if needed, detects vector dimensions from the first pending vector, uploads only vectors with `vectorId: null` or `embeddingStatus: pending`, and removes vectors for deleted documents.

Qdrant payload contains:

```json
{
  "chunkId": "deterministic-chunk-id",
  "documentId": "deterministic-document-id",
  "url": "https://fgulen.com/example",
  "title": "Article title",
  "language": "en",
  "headingPath": ["Book", "Chapter", "Section"],
  "chunkIndex": 0,
  "totalChunks": 5,
  "tokenCount": 782,
  "contentHash": "sha256",
  "sourceFile": "en/article.md"
}
```

After upload, `data/index/chunks.json` is updated with the deterministic Qdrant point ID in `vectorId`, plus `embeddingStatus`, `embeddedAt`, `embeddingModel`, and `embeddingDimensions`. `pnpm qdrant --resume` is safe after interruption because each successful batch persists index state.

`pnpm qdrant status` prints:

```text
Collection: fgulen
Vectors: 25342
Pending uploads: 14
Deleted vectors: 3
```

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
