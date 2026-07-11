# GulenAI Ingestion

Production-oriented Node.js + TypeScript ingestion pipeline for building a knowledge base from published works. The completed increments implement the generic crawler for `https://fgulen.com`, content extraction from crawled raw HTML, Markdown conversion, intelligent chunking, document indexing, embedding generation, Qdrant vector-store synchronization, semantic retrieval, prompt assembly, strict RAG answer generation, and traceable citations.

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
- Semantic retrieval over Qdrant with query embeddings, topK, score thresholds, payload filters, duplicate removal, adjacent chunk merging, and deterministic ranking
- Crawl strategy and content selection for language-scoped crawls, include/exclude regex patterns, category/index-page detection, content quality scoring, normalized-text and similarity-hash duplicate detection, and crawl quality reports
- HTML dataset inspection via `pnpm inspect`
- Prompt assembly from retrieved chunks without calling an LLM, with token-budget trimming and `data/prompts/prompt.md` / `prompt.json` output
- Retrieval diagnostics for Qdrant/index/vector consistency and search validation reports
- Strict RAG answer generation with OpenAI Chat Completions, context-only answers, confidence scoring, and internal used/ignored chunk tracking
- Citation rendering from used answer chunks, with `data/answers/answer.md`, `data/answers/answer.json`, and citation validation reports
- Pino logging, Zod config validation, strict TypeScript, ESLint, Prettier
- Unit tests for URL policy, HTML parsing, crawler behavior, content extraction, metadata, Markdown conversion, intelligent chunking, document indexing, embedding jobs, Qdrant sync, semantic retrieval, crawl quality, prompt assembly, strict answers, and citations

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
CRAWL_INCLUDE_PATTERNS=
CRAWL_EXCLUDE_PATTERNS=[?&]start=
CRAWL_LANGUAGES=tr
CRAWL_QUALITY_THRESHOLD=45
CRAWL_MIN_WORD_COUNT=120
CRAWL_DUPLICATE_SIMHASH_DISTANCE=3
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
OPENAI_CHAT_MODEL=gpt-4o-mini
TEMPERATURE=0
MAX_OUTPUT_TOKENS=800
EMBEDDING_BATCH_SIZE=64
EMBEDDING_CONCURRENCY=2
EMBEDDING_RETRIES=3
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=fgulen
QDRANT_BATCH_SIZE=64
QDRANT_CONCURRENCY=2
QDRANT_RETRIES=3
SEARCH_TOP_K=8
SEARCH_SCORE_THRESHOLD=0.0
PROMPT_MAX_CONTEXT_TOKENS=6000
PORT=3000
HOST=127.0.0.1
API_PREFIX=/api/v1
API_VERSION=1.0
CORS_ORIGIN=*
API_BODY_LIMIT_BYTES=1048576
```

To add another website later, change the seed, allowed domains, and path filters. The crawler does not contain `fgulen.com`-specific logic.

## Commands

```bash
pnpm crawl
pnpm crawl --language tr
pnpm crawl --language tr --language en
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
pnpm search "user question"
pnpm search "user question" --topK 5 --threshold 0.5 --language tr
pnpm prompt "user question"
pnpm prompt "user question" --topK 5 --threshold 0.5 --language tr --maxContextTokens 4000
pnpm answer "user question"
pnpm answer --sources "user question"
pnpm answer "user question" --topK 5 --threshold 0.5 --maxContextTokens 4000
pnpm diagnose
pnpm validate-search "user question"
pnpm validate-search "user question" --language tr
pnpm inspect
pnpm crawl-report
pnpm api
pnpm mcp
```

`crawl`, `extract`, `markdown`, `chunk`, `index`, `status`, `embed`, `qdrant`, `search`, `prompt`, `answer`, `diagnose`, `validate-search`, `inspect`, `crawl-report`, `api`, `mcp`, and `reset` are implemented.

## Crawl Strategy

The crawler still visits category, table-of-contents, archive, tag, and language landing pages so their outgoing links can be discovered. Those pages are no longer saved to `data/raw` unless they pass the content selection policy. Downstream extraction, Markdown conversion, chunking, indexing, embedding, and Qdrant upload therefore operate only on selected knowledge pages.

Language scope can be configured in `.env`:

```env
CRAWL_LANGUAGES=tr,en
```

It can also be overridden per run:

```bash
pnpm crawl --language tr
pnpm crawl --language tr --language en
```

Path and regex rules are both supported:

```env
CRAWL_INCLUDE_PATHS=/tr,/en
CRAWL_EXCLUDE_PATHS=/search,/wp-admin
CRAWL_INCLUDE_PATTERNS=/tr/.+
CRAWL_EXCLUDE_PATTERNS=([?&]start=|category|tag|archive)
```

Content quality scoring uses word count, OpenAI-compatible token count, text density, heading density, navigation ratio, link density, duplicate percentage, and boilerplate ratio. Pages below `CRAWL_QUALITY_THRESHOLD`, pages below `CRAWL_MIN_WORD_COUNT`, and detected low-value page types are skipped. Duplicate pages are detected by normalized text hash and a 64-bit similarity hash; only the highest-quality copy is kept.

Every crawl writes:

```text
data/crawl/quality-decisions.json
reports/crawl-quality.html
reports/crawl-quality.md
```

The crawl quality report includes total pages visited, indexed pages, skipped pages, duplicate pages, category pages, low-quality pages, average quality score, average word count, average token count, top 20 lowest-quality pages, top 20 highest-quality pages, and language distribution.

`pnpm inspect` writes `reports/dataset-inspection.html`, an HTML inventory of the currently generated dataset with clickable source links.

## Data Layout

```text
data/
  raw/         raw HTML pages
  clean/       cleaned article HTML and .metadata.json sidecars
  markdown/    markdown documents and copied .metadata.json sidecars
  chunks/      semantic chunk JSON files
  index/       document and chunk manifests
  embeddings/  temporary embedding vector JSON files
  prompts/     assembled prompt.md and prompt.json files
  answers/     latest cited answer.md and answer.json files
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

Qdrant sync reads `data/embeddings`, `data/chunks`, and `data/index/chunks.json`. It automatically creates `QDRANT_COLLECTION` if needed, detects vector dimensions from the first pending vector, uploads new or pending vectors, refreshes existing vectors whose payload does not yet contain chunk content, and removes vectors for deleted documents.

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
  "source": "en/article.md",
  "content": "# Section heading\n\nFull chunk Markdown..."
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

Semantic retrieval embeds the user query with `OPENAI_EMBEDDING_MODEL`, searches Qdrant, reads matching Markdown directly from each Qdrant payload, removes duplicate chunk hits, merges adjacent chunks from the same document when appropriate, and prints ranked context candidates. Runtime retrieval does not require `data/chunks` or `data/index`. It does not generate answers.

Supported search filters:

```bash
pnpm search "ihlas nedir?" --language tr
pnpm search "sincerity" --sourceFile en/article.md
pnpm search "merhamet" --documentId document-id --title "Kırık Testi"
pnpm search "sabır" --url https://fgulen.com/example
```

Search results include:

```json
{
  "chunkId": "deterministic-chunk-id",
  "documentId": "deterministic-document-id",
  "title": "Kırık Testi",
  "url": "https://fgulen.com/example",
  "headingPath": ["İhlas", "Samimiyet"],
  "similarityScore": 0.94,
  "markdown": "# İhlas\n\n...",
  "metadata": {
    "chunkIds": ["chunk-1", "chunk-2"],
    "sourceFile": "tr/article.md",
    "language": "tr",
    "chunkIndex": 0,
    "totalChunks": 10,
    "tokenCount": 900,
    "contentHash": "sha256",
    "merged": true
  }
}
```

CLI output:

```text
Top Results

1.
Score: 0.94
Book: Kırık Testi
Heading:
İhlas -> Samimiyet
```

Prompt assembly uses semantic retrieval results to write:

```text
data/prompts/prompt.md
data/prompts/prompt.json
```

The prompt contains `SYSTEM`, `QUESTION`, `RETRIEVED CONTEXT`, and `INSTRUCTIONS` sections. Each context block includes title, URL, heading path, chunk ID, merged chunk IDs, score, and Markdown content. The assembler preserves retrieval score ordering, keeps retrieval-engine merged chunks as single context blocks, and trims the lowest-ranked chunks when the retrieved context exceeds `PROMPT_MAX_CONTEXT_TOKENS` or `--maxContextTokens`.

`prompt.json` contains:

```json
{
  "systemPrompt": "string",
  "userQuestion": "string",
  "chunks": [],
  "estimatedTokens": 1234,
  "trimmedChunks": []
}
```

Prompt assembly does not call a chat/completions API and does not generate an answer.

Strict RAG answer generation uses the assembled prompt and retrieved chunks to call the OpenAI Chat Completions API:

```bash
pnpm answer "İhlas nedir?"
```

Answer generation is intentionally strict. The system prompt requires the model to answer only from supplied context, never use outside knowledge, never guess, never hallucinate, and never fabricate references. When the retrieved context is insufficient, the answer must be exactly:

```text
Bu soru mevcut HürKul arşivindeki kaynaklarla cevaplanamıyor.
```

### Answer prompt design

The answer prompt is structured as a research-assistant workflow rather than a restrictions-only checklist. It directs the model to define the requested concept first, explain it in complete and connected Turkish paragraphs, use all relevant retrieved evidence, synthesize compatible discussions from multiple books into one coherent account, and compare complementary viewpoints when the context supports that comparison. Repetition, isolated source-by-source summaries, unnecessary headings, and intentional shortening are discouraged so that answer depth follows the available evidence rather than an arbitrary preference for brevity.

Grounding remains the controlling constraint. Every claim must come from the supplied context and carry its exact supporting Context Chunk ID; claims combining evidence must cite every directly supporting chunk. The prompt still forbids outside knowledge, guesses, invented information, and fabricated references. The insufficient-context sentence, chat-completion parameters, answer JSON structure, `usedChunkIds` and `ignoredChunkIds` bookkeeping, and downstream citation objects are unchanged. The redesign affects answer-generation instructions only; it does not alter retrieval, ranking, `topK`, context ordering, or context-budget trimming.

The structured answer result contains:

```json
{
  "answer": "string",
  "confidence": 94,
  "usedChunks": [],
  "ignoredChunks": [],
  "estimatedTokens": 1234,
  "model": "gpt-4o-mini"
}
```

To render citations, use:

```bash
pnpm answer --sources "İhlas nedir?"
```

The citation engine uses the strict answer's internally tracked `usedChunks`, appends source markers to supported answer sentences, groups multiple supporting chunks under the same citation marker, and writes:

```text
data/answers/answer.md
data/answers/answer.json
reports/citation-validation.html
```

Each internal citation includes document title, source URL, heading path, source file, chunk ID, retrieval score (under both the backwards-compatible `score` field and `similarityScore`), a sentence-aware plain-text excerpt, chunk index, and total chunks. Unsupported answers do not fabricate citations.

`answer.json` contains:

```json
{
  "question": "string",
  "answer": "string",
  "confidence": 94,
  "citations": [
    {
      "id": 1,
      "title": "Kırık Testi",
      "url": "https://example.test",
      "headingPath": ["Diriliş Mimarlarının Vazifesi", "İhlas ve Rıza"],
      "sourceFile": "tr/example.md",
      "chunkId": "chunk-id",
      "score": 0.96,
      "similarityScore": 0.96,
      "excerpt": "İhlas ve rıza, insanın davranışlarını yalnız Allah'ın hoşnutluğuna yöneltmesiyle derinleşir.",
      "chunkIndex": 0,
      "totalChunks": 3
    }
  ]
}
```

## REST API

For local development, start the API server directly from TypeScript:

```bash
pnpm api
```

For production, install dependencies, compile the project, and use the standard npm start
command:

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

`npm start` runs the compiled REST API. The following environment variables must be set to
non-empty values or startup fails with a clear error:

```env
OPENAI_API_KEY=your-openai-api-key
QDRANT_URL=https://your-qdrant-host.example
QDRANT_COLLECTION=fgulen
```

The server reads `PORT` from the environment and falls back to `3000`. `HOST` is also
configurable; use `HOST=0.0.0.0` when the deployment platform requires the service to bind on
all network interfaces. On `SIGTERM` or `SIGINT`, the process stops accepting requests and
closes Fastify cleanly.

By default the API listens on `http://127.0.0.1:3000` and registers v1 routes under `API_PREFIX`, which defaults to `/api/v1`. OpenAPI documentation is generated automatically and served at:

```text
http://127.0.0.1:3000/docs
```

API configuration:

```env
PORT=3000
HOST=127.0.0.1
API_PREFIX=/api/v1
API_VERSION=1.0
CORS_ORIGIN=*
API_BODY_LIMIT_BYTES=1048576
```

Health and metadata:

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:3000/api/v1/stats
curl http://127.0.0.1:3000/api/v1/version
```

Search:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/search \
  -H 'content-type: application/json' \
  -d '{"question":"İhlas nedir?","topK":10,"language":"tr"}'
```

Prompt assembly without answer generation:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/prompt \
  -H 'content-type: application/json' \
  -d '{"question":"İhlas nedir?","language":"tr"}'
```

Strict answer generation with citations:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/answer \
  -H 'content-type: application/json' \
  -d '{"question":"İhlas nedir?","language":"tr"}'
```

The REST response keeps internal citation compatibility details private and returns the frontend citation shape:

```json
{
  "answer": "Supported answer text. [1]",
  "confidence": 94,
  "citations": [
    {
      "title": "Kırık Testi",
      "heading": "İhlas ve Rıza",
      "excerpt": "İhlas ve rıza, insanın davranışlarını yalnız Allah'ın hoşnutluğuna yöneltmesiyle derinleşir.",
      "url": "https://example.test",
      "similarityScore": 0.96,
      "chunkIndex": 0,
      "totalChunks": 3
    }
  ]
}
```

Sources only:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/sources \
  -H 'content-type: application/json' \
  -d '{"question":"İhlas nedir?","language":"tr"}'
```

Document and chunk metadata:

```bash
curl http://127.0.0.1:3000/api/v1/document/<documentId>
curl http://127.0.0.1:3000/api/v1/chunk/<chunkId>
```

Errors use a consistent JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed"
  }
}
```

## MCP Server

The standalone MCP server exposes the Knowledge Engine over STDIO:

```bash
pnpm mcp
```

Server information:

```text
Name: FGulen AI
Version: 1.0
Description: Knowledge Engine powered by FGulen AI.
```

MCP tools:

- `search`: accepts `question`, optional `topK`, optional `language`; returns retrieved chunks, scores, and metadata.
- `answer`: accepts `question`, optional `topK`, optional `language`; returns answer, confidence, and citations.
- `sources`: accepts `question`, optional `language`; returns citations only.
- `document`: accepts `documentId`; returns document metadata.
- `chunk`: accepts `chunkId`; returns chunk metadata.

MCP resources:

- `knowledge://stats`
- `knowledge://version`
- `knowledge://languages`
- `knowledge://collection`

MCP prompts:

- `answer-question`
- `search-only`
- `citation-report`

Example client command:

```bash
/usr/local/bin/node --import tsx src/mcp/server.ts
```

ChatGPT connector configuration:

```json
{
  "name": "FGulen AI",
  "transport": {
    "type": "stdio",
    "command": "/usr/local/bin/node",
    "args": ["--import", "tsx", "/absolute/path/to/gulenai/src/mcp/server.ts"]
  }
}
```

Claude Desktop configuration:

```json
{
  "mcpServers": {
    "fgulen-ai": {
      "command": "/usr/local/bin/node",
      "args": ["--import", "tsx", "/absolute/path/to/gulenai/src/mcp/server.ts"],
      "env": {
        "OPENAI_API_KEY": "your-openai-key",
        "QDRANT_URL": "your-qdrant-url",
        "QDRANT_API_KEY": "your-qdrant-api-key",
        "QDRANT_COLLECTION": "fgulen"
      }
    }
  }
}
```

Codex CLI configuration follows the same STDIO command pattern:

```json
{
  "mcp_servers": {
    "fgulen-ai": {
      "command": "/usr/local/bin/node",
      "args": ["--import", "tsx", "/absolute/path/to/gulenai/src/mcp/server.ts"],
      "env": {
        "OPENAI_API_KEY": "your-openai-key",
        "QDRANT_URL": "your-qdrant-url",
        "QDRANT_API_KEY": "your-qdrant-api-key",
        "QDRANT_COLLECTION": "fgulen"
      }
    }
  }
}
```

Retrieval diagnostics validate that the local manifests, embedding files, and Qdrant collection are in sync:

```bash
pnpm diagnose
```

The command reports Qdrant connectivity, collection existence, vector count, embedding model and dimensions, indexed documents, indexed chunks, embedded chunks, pending chunks, missing vectors, and orphan vectors. It writes:

```text
reports/retrieval-validation.html
```

To validate a specific query before answer generation:

```bash
pnpm validate-search "ihlas nedir?"
pnpm validate-search "sincerity" --language en
```

`validate-search` prints the generated query embedding dimension and the top 20 retrieved chunks with similarity score, title, heading path, URL, chunk ID, and the first 200 characters of chunk text. If no results are returned, it explains the likely cause, such as an empty collection, pending embeddings, missing Qdrant vectors, or a Qdrant payload-index requirement for filtered searches.

### Retrieval audit mode

Retrieval auditing is disabled by default and does not alter retrieval, ranking, prompts, or API responses. Enable it explicitly for API, MCP, or CLI answer requests:

```bash
RETRIEVAL_AUDIT_ENABLED=true pnpm api
RETRIEVAL_AUDIT_ENABLED=true pnpm answer "ihlas nedir?"
```

Each answer request writes matching JSON and Markdown files under `reports/retrieval-audit/`. A report records the question, embedding model, requested and returned `topK`, retrieval counts, unique documents, books and heading paths, token totals, ordered chunk details, diversity metrics, and the exact chat-completion request. If no context survives prompt assembly, `finalPrompt` is `null` because no LLM request is sent.

For audit metrics, a “book” is the first heading-path component, a heading group is the complete heading path, and duplicate percentage is the share of retrieved results beyond the first result from each document. Context tokens are the indexed token counts of chunks included in the final context; prompt tokens count the exact system and user message contents. Audit write failures are isolated from answer generation.

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
