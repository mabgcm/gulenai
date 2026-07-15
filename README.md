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

- Node.js 22.23.1
- pnpm 9.15.4 through Corepack
- Chromium browser for Playwright

Activate the repository runtime before installing:

```bash
nvm install
nvm use
corepack enable
pnpm install
```

Install Playwright's Chromium browser before a real crawl:

```bash
pnpm exec playwright install chromium
```

## Setup

```bash
cp .env.example .env
pnpm install
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

Grounding remains the controlling constraint. Every claim must come from the supplied context and carry its exact supporting Context Chunk ID; claims combining evidence must cite every directly supporting chunk. The prompt still forbids outside knowledge, guesses, invented information, and fabricated references. The insufficient-context sentence, chat-completion parameters, answer JSON structure, `usedChunkIds` and `ignoredChunkIds` bookkeeping, and downstream citation objects are unchanged. The prompt redesign itself affects answer-generation instructions only; it does not alter retrieval, ranking, `topK`, or context-budget trimming.

### Context diversity optimization

Answer generation applies a deterministic diversity layer after semantic retrieval and before prompt construction. Search itself, Qdrant queries, embeddings, similarity scores, `topK`, and search API results remain unchanged. The optimizer keeps the highest-scoring result first, allows at most two prompt results from one document, and favors a previously unrepresented book or heading path when candidates are within `0.03` similarity. A book is identified by the first heading-path component, falling back to title and then document ID.

Adjacent results from the same document are suppressed only when their normalized term overlap is at least `80%`; distinct neighboring chunks are retained. Within the narrow similarity window, selection priority is new book, new heading path, new document, and then original semantic order. This preserves relevance while allowing diverse evidence to enter the context budget earlier. The prompt assembler preserves this optimized order only for answer generation; standalone retrieval and prompt APIs retain their existing behavior.

### Structured context builder

After diversity optimization, answer generation passes the retained chunks through a deterministic context builder. The builder does not summarize, paraphrase, rewrite, or call an LLM. It assigns each chunk to one fixed section—`Definition`, `Core Concepts`, `Supporting Evidence`, `Complementary Evidence`, `Examples`, or `Related Concepts`—using ordered, documented keyword rules over the existing title, heading path, and content. Unmatched chunks go to `Supporting Evidence`.

Sections follow the fixed order shown above, while chunks retain their incoming order inside each section. The builder preserves every input chunk object, primary chunk ID, merged chunk-ID list, citation metadata, and Markdown string exactly. It adds only deterministic section labels and `---` separators. A section heading is emitted once, which collapses duplicate organizational labels without deleting or modifying headings contained in source Markdown. No retrieved content is removed by this stage; context-budget trimming remains the prompt assembler’s separate existing responsibility.

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
pnpm dev
```

For a production-style local run, install dependencies, compile the project, and start the compiled API:

```bash
pnpm install
pnpm build
NODE_ENV=production pnpm start
```

`pnpm start` verifies Node 22 and rebuilds `dist` in its `prestart` lifecycle before running the compiled REST API. The explicit `pnpm build` above is useful as an early compile check; `prestart` intentionally repeats it so stale production output cannot be started. The following environment variables must be set to
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

The report includes ordered before/after optimization tables plus documents represented, books represented, heading diversity, duplicate reduction, prompt-token savings, and a context-diversity score. The score is the mean of document, book, and heading uniqueness ratios, expressed from 0 to 100. Prompt-token savings compare assembled prompt estimates before and after optimization under the same context budget.

It also records `Raw Context Layout` (the optimizer output entering the builder), `Structured Context Layout`, the signed token difference introduced by deterministic labels and separators, section count, and per-section chunk distribution.

For audit metrics, a “book” is the first heading-path component, a heading group is the complete heading path, and duplicate percentage is the share of retrieved results beyond the first result from each document. Context tokens are the indexed token counts of chunks included in the final context; prompt tokens count the exact system and user message contents. Audit write failures are isolated from answer generation.

## Risale-i Nur ingestion from eRisale

The Risale workflow is an isolated corpus-preparation pipeline for the public Turkish pages at `https://www.erisale.com`. Its knowledge-source identity is:

```text
id: risale
name: Risale-i Nur Külliyatı
language: tr
```

It does not add the corpus to runtime retrieval. FGülen commands, data directories, collection configuration, retrieval, ranking, prompts, and answer generation remain unchanged.

### Crawler and resume behavior

The crawler requests the Turkish catalog page and reads its public `books` metadata to discover every book and declared page count. It then deterministically creates every canonical page URL in this form:

```text
https://www.erisale.com/index.jsp?bookId=1&locale=tr&pageNo=1
```

Before crawling, it requests `https://www.erisale.com/robots.txt` and applies published allow, disallow, and crawl-delay rules. When the site publishes no robots file (currently HTTP 404), the crawler records that condition and applies its own minimum one-second delay. Crawling is sequential, retries transient failures, stores raw HTML without modification, and persists state after every attempted page.

Resume is automatic. `data/risale/crawl/state.json` records discovered books, completed `bookId:pageNo` keys, active failures, and the update time. A page is skipped if its key is complete or its raw HTML already exists. Successful retries remove the page’s previous failure record. `RISALE_MAX_PAGES` limits new attempts per run for a controlled test crawl; `0` means the complete collection.

### Parser and attribution

eRisale pages provide the visible book text in a server-rendered `<noscript>` block. The parser reads only that content, removes scripts and interface elements, and preserves source paragraphs, headings, footnotes, Turkish wording, and quoted source-language passages. It does not summarize or paraphrase. Book, section, and optional subsection values come from the page’s source title hierarchy.

Every page and chunk retains its canonical eRisale URL and the attribution `eRisale — Risale-i Nur Külliyatı`. Copyright or rights notices visible in a source page are copied verbatim into `copyrightNotices`; the raw HTML is also retained so no source notice is lost even when it is outside the book-text block.

### Chunk metadata

The existing token-aware `MarkdownChunker` is used without a separate Risale chunking algorithm. Every Risale chunk contains:

```json
{
  "knowledgeSource": "risale",
  "book": "Sözler",
  "section": "Birinci Söz",
  "subsection": null,
  "canonicalUrl": "https://www.erisale.com/index.jsp?bookId=1&locale=tr&pageNo=1",
  "language": "tr",
  "chunkIndex": 0,
  "totalChunks": 1
}
```

Source attribution and preserved copyright notices accompany these fields and are also included in the dedicated Qdrant payload.

### Directory layout

```text
data/risale/
  crawl/state.json               discovery, resume, and failure state
  raw/book-XX/                   original HTML and canonical metadata
  markdown/book-XX/              parsed source text and metadata
  chunks/book-XX/                existing-strategy chunk JSON
  index/                         isolated document/chunk manifests
  embeddings/                    isolated embedding vectors

reports/risale-ingestion/
  validation.json
  validation.md
```

### Commands and dedicated collection

Configure the dedicated collection and crawl policy:

```env
RISALE_QDRANT_COLLECTION=risale
RISALE_CRAWL_DELAY_MS=1000
RISALE_CRAWL_RETRIES=3
RISALE_MAX_PAGES=0
```

`RISALE_QDRANT_COLLECTION` must differ from `QDRANT_COLLECTION`; synchronization fails before upload if they match. The existing embedding model and embedding pipeline are reused, but manifests, vector files, and Qdrant vectors remain isolated.

Run the full workflow:

```bash
pnpm run doctor
pnpm risale ingest
```

`pnpm risale ingest` runs a preflight before requesting the eRisale catalog. It requires Node 22, a non-empty `OPENAI_API_KEY`, an accessible `QDRANT_URL` (and `QDRANT_API_KEY` when required), and different FGülen and Risale collection names. A missing dedicated Risale collection is valid because the Qdrant phase creates it; failure to list collections is not. Preflight failures stop before crawling and identify the setting that needs attention.

Validate ingestion startup without crawling, embedding, or writing vectors:

```bash
pnpm risale ingest --preflight-only
```

The complete ingestion writes JSON and Markdown validation reports with books discovered, pages downloaded, pages parsed, chunks created, embeddings generated, vectors inserted, skipped pages, and failed pages. Embedding and Qdrant phases use resume mode. Because the public catalog contains thousands of pages, a complete polite crawl takes substantial time and embedding generation incurs provider usage.

## Development

### Runtime consistency

Node.js 22.23.1 is the single project runtime. `.nvmrc` and `.node-version` pin it for nvm, nodenv, asdf, and mise-compatible tooling; `package.json#engines` and `package.json#volta` pin the same release for package managers, Railway, and Volta. `package.json#packageManager` and Volta pin pnpm 9.15.4. No repository Railway file, Dockerfile, mise file, or GitHub Actions workflow currently overrides these values.

The observed Node 20 runtime came from the developer machine's nvm `default` alias, which was set to 20.20.1. Repository version files do not automatically change an already-open shell. Correct the shell once and verify it:

```bash
nvm alias default 22.23.1
nvm use
node --version
```

`.npmrc` enables strict engine validation, so dependency installation fails under a different runtime. Every project script also runs through `scripts/node-runtime.sh`, which selects the package manager's own Node executable and rejects anything other than 22.23.1. This prevents an unrelated `node` binary in a parent `node_modules/.bin` directory from changing npm, npx, tsx, or pnpm script behavior.

Activate the pinned runtime and package manager before installing:

```bash
nvm install
nvm use
corepack enable
pnpm install
```

If `pnpm` is still unavailable, make sure `nvm use` ran before `corepack enable`; Corepack installs its shim beside the active Node executable. Open a new shell or run `hash -r` after changing runtimes.

Use the production-style workflow when validating deploy behavior:

```bash
pnpm build
pnpm start
```

`pnpm start` always rebuilds before launching `dist/src/api/index.js`, even if `dist` already exists. For source-based development, use:

```bash
pnpm dev
```

`pnpm api` remains an alias-compatible source runner and has the same Node 22 runtime guard as `pnpm dev`. All project entry points inherit the same executable from the package-manager process.

Railway detects `packageManager: pnpm@9.15.4`, installs that pnpm release through Corepack, and resolves Node 22 from `engines.node`. With no repository Dockerfile or Railway config override, Railpack uses the package build/start scripts: the TypeScript build produces `dist`, and the start lifecycle verifies Node, rebuilds once more, then executes `node dist/src/api/index.js`. Railway supplies `NODE_ENV=production` and `PORT`; the server’s production runtime binds to `0.0.0.0` unless `HOST` is explicitly configured. Any dashboard Build Command or Start Command override must remain consistent with these scripts.

Run the project environment report before ingestion or before comparing local behavior with Railway:

```bash
pnpm run doctor
pnpm verify:runtime
```

The report prints the Node and pnpm versions, resolved executable, detected runtime manager, environment readiness, CLI wiring, runtime configuration, OpenAI models, a redacted Qdrant URL, both collection names, and individual PASS/FAIL checks for Node, pnpm, npm, npx, and tsx. It exits nonzero when any required check fails.

pnpm reserves `pnpm doctor` for its own built-in package-manager diagnostic, so the repository script must be invoked explicitly as `pnpm run doctor`. The built-in command does not read `package.json#scripts` and does not print application configuration.

In Railway, compare the project doctor values with the Node version in the Railpack build plan and the `Node runtime verified` line emitted during startup. Also confirm the deployed Git commit and that the build log runs the pinned pnpm 9.15.4.

### Answer evaluation benchmark

The human-review benchmark is stored in `tests/evaluation/questions.json`. Each entry has a unique `id`, a stable `category`, the exact `question`, and a `difficulty` of `easy`, `medium`, or `hard`:

```json
{
  "id": "concept-ihlas-01",
  "category": "core-concepts",
  "question": "İhlas nedir?",
  "difficulty": "easy"
}
```

Add questions by appending objects with unique IDs. Keep existing IDs and wording stable when longitudinal comparison matters; changing either creates a different benchmark input even if the subject is similar. The loader rejects missing fields, invalid difficulty values, empty files, and duplicate IDs.

Run the complete benchmark against the configured local answer pipeline:

```bash
pnpm run evaluate
```

The command uses the current `.env` configuration and therefore requires the same OpenAI and Qdrant access as a normal local answer request. Questions run sequentially. Results are written to `reports/evaluation/YYYY-MM-DD/evaluation.json` and `evaluation.md`. Each result contains the full answer, citations, confidence, response time, total answer-pipeline token estimate, character length, fallback status, and any execution error. The command still writes reports when individual questions fail, then exits nonzero. No automatic quality score is calculated.

For a readable comparison, open two dated Markdown reports side by side. For an exact machine-readable comparison, use Git or another JSON-aware diff tool, for example:

```bash
git diff --no-index reports/evaluation/2026-07-10/evaluation.json reports/evaluation/2026-07-11/evaluation.json
```

Compare matching question IDs and review answer text, citations, confidence, timing, and token changes together. Runtime measurements can vary with network and provider load, so they should not be interpreted as answer-quality scores.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Extensibility

The source model is intentionally generic:

- Web pages through seed URLs and crawl policies
- Future RSS sources
- Future local folders
- Future PDF, EPUB, DOCX, and YouTube transcript sources

New sources should implement source-specific discovery/input adapters while preserving the shared downstream contracts: raw content, cleaned content, markdown, chunks, embeddings, and vector payload metadata.
