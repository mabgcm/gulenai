import { join } from "node:path";
import { loadConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ChunkingPipeline } from "../chunking/chunkingPipeline.js";
import { MarkdownChunker } from "../chunking/chunker.js";
import { MarkdownDocumentReader } from "../chunking/markdownDocumentReader.js";
import { ChunkStore } from "../chunking/chunkStore.js";
import { OpenAiTokenCounter } from "../chunking/tokenCounter.js";
import { ChunkPayloadReader } from "../embedding/chunkPayloadReader.js";
import { OpenAiEmbeddingClient } from "../embedding/embeddingClient.js";
import { EmbeddingPipeline } from "../embedding/embeddingPipeline.js";
import { EmbeddingVectorStore } from "../embedding/embeddingVectorStore.js";
import { EmbeddingIndexManifestStore } from "../embedding/indexManifestStore.js";
import { ChunkIndexReader } from "../indexing/chunkIndexReader.js";
import { IndexPipeline } from "../indexing/indexPipeline.js";
import { ManifestStore } from "../indexing/manifestStore.js";
import { EmbeddingVectorReader, QdrantChunkPayloadReader } from "../qdrant/qdrantDataReaders.js";
import { RestQdrantVectorClient } from "../qdrant/qdrantClient.js";
import { QdrantIndexStore } from "../qdrant/qdrantIndexStore.js";
import { QdrantSyncPipeline } from "../qdrant/qdrantPipeline.js";
import { RISALE_SOURCE } from "./catalog.js";
import { FetchRisaleHttpClient, RisaleCrawler } from "./crawler.js";
import { RisalePageParser, RisaleParsingPipeline } from "./parser.js";
import { runRisalePreflight } from "./preflight.js";
import type { RisaleValidationReport } from "./types.js";
import { RisaleValidationReportWriter } from "./validationReport.js";

const DATA_DIR = join(process.cwd(), "data", "risale");
const userAgent = "HurkKul-Risale-Ingestion/1.0 (+source: https://www.erisale.com)";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const phase = process.argv[2] ?? "ingest";
  const preflightOnly = process.argv.includes("--preflight-only");
  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const report: RisaleValidationReport = {
    generatedAt: new Date().toISOString(),
    knowledgeSource: "risale",
    collection: config.RISALE_QDRANT_COLLECTION,
    booksDiscovered: 0,
    pagesDownloaded: 0,
    pagesParsed: 0,
    chunksCreated: 0,
    embeddingsGenerated: 0,
    vectorsInserted: 0,
    skippedPages: 0,
    failedPages: 0
  };

  const preflight = await runRisalePreflight(config);
  logger.info(
    {
      node: process.version,
      executable: process.execPath,
      qdrantCollections: preflight.qdrantCollections,
      risaleCollectionExists: preflight.risaleCollectionExists
    },
    "Risale ingestion preflight passed"
  );
  if (preflightOnly) {
    logger.info("Preflight-only validation complete; no ingestion phases were run");
    return;
  }

  const runCrawl = async (): Promise<void> => {
    const summary = await new RisaleCrawler(
      {
        dataDir: DATA_DIR,
        delayMs: Math.max(1000, config.RISALE_CRAWL_DELAY_MS),
        retries: config.RISALE_CRAWL_RETRIES,
        maxPages: config.RISALE_MAX_PAGES,
        userAgent
      },
      new FetchRisaleHttpClient(userAgent),
      logger
    ).run();
    Object.assign(report, {
      booksDiscovered: summary.booksDiscovered,
      pagesDownloaded: summary.pagesDownloaded,
      skippedPages: summary.skippedPages,
      failedPages: summary.failedPages
    });
  };
  const runParse = async (): Promise<void> => {
    const summary = await new RisaleParsingPipeline(DATA_DIR, new RisalePageParser(), logger).run();
    Object.assign(report, {
      pagesParsed: summary.pagesParsed,
      failedPages: report.failedPages + summary.failedPages
    });
  };
  const runChunk = async (): Promise<void> => {
    const summary = await new ChunkingPipeline(
      new MarkdownDocumentReader(join(DATA_DIR, "markdown")),
      new MarkdownChunker(
        {
          targetTokens: config.CHUNK_SIZE_TOKENS,
          maxTokens: config.CHUNK_MAX_TOKENS,
          overlapTokens: config.CHUNK_OVERLAP_TOKENS,
          embeddingMaxTokens: config.EMBEDDING_MAX_INPUT_TOKENS
        },
        new OpenAiTokenCounter()
      ),
      new ChunkStore(join(DATA_DIR, "chunks")),
      logger
    ).run();
    Object.assign(report, { chunksCreated: summary.writtenChunks });
  };
  const runIndex = async (): Promise<void> => {
    await new IndexPipeline(
      new ChunkIndexReader(join(DATA_DIR, "chunks")),
      new ManifestStore(join(DATA_DIR, "index")),
      logger
    ).run();
  };
  const runEmbed = async (): Promise<void> => {
    const summary = await new EmbeddingPipeline(
      new EmbeddingIndexManifestStore(join(DATA_DIR, "index")),
      new ChunkPayloadReader(join(DATA_DIR, "chunks")),
      new EmbeddingVectorStore(join(DATA_DIR, "embeddings")),
      new OpenAiEmbeddingClient(config.OPENAI_API_KEY, model, config.EMBEDDING_RETRIES, logger),
      {
        model,
        batchSize: Math.max(1, config.EMBEDDING_BATCH_SIZE),
        concurrency: Math.max(1, config.EMBEDDING_CONCURRENCY),
        retries: config.EMBEDDING_RETRIES,
        resume: true
      },
      logger
    ).run();
    Object.assign(report, { embeddingsGenerated: summary.completed });
  };
  const runQdrant = async (): Promise<void> => {
    if (config.RISALE_QDRANT_COLLECTION === config.QDRANT_COLLECTION) {
      throw new Error("RISALE_QDRANT_COLLECTION must differ from QDRANT_COLLECTION");
    }
    const summary = await new QdrantSyncPipeline(
      new QdrantIndexStore(join(DATA_DIR, "index")),
      new EmbeddingVectorReader(join(DATA_DIR, "embeddings")),
      new QdrantChunkPayloadReader(join(DATA_DIR, "chunks")),
      new RestQdrantVectorClient(config.QDRANT_URL, config.QDRANT_API_KEY),
      {
        collection: config.RISALE_QDRANT_COLLECTION,
        batchSize: Math.max(1, config.QDRANT_BATCH_SIZE),
        concurrency: Math.max(1, config.QDRANT_CONCURRENCY),
        retries: config.QDRANT_RETRIES,
        resume: true
      },
      logger
    ).sync();
    Object.assign(report, { vectorsInserted: summary.uploadedVectors });
  };

  const phases: Record<string, () => Promise<void>> = {
    crawl: runCrawl,
    parse: runParse,
    chunk: runChunk,
    index: runIndex,
    embed: runEmbed,
    qdrant: runQdrant
  };
  if (phase === "ingest") {
    for (const run of Object.values(phases)) await run();
  } else {
    const run = phases[phase];
    if (run === undefined)
      throw new Error("Usage: pnpm risale <ingest|crawl|parse|chunk|index|embed|qdrant>");
    await run();
  }
  const paths = await new RisaleValidationReportWriter().write({
    ...report,
    generatedAt: new Date().toISOString()
  });
  logger.info({ phase, source: RISALE_SOURCE, report, paths }, "Risale ingestion phase complete");
};

main().catch((error: unknown) => {
  logger.error({ err: error }, "Risale ingestion failed");
  process.exitCode = 1;
});
