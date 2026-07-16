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
import {
  RisaleEmbeddingFailureReporter,
  classifyEmbeddingError,
  type RisaleEmbeddingFailure
} from "./embeddingFailureReport.js";
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
    logger.info("Crawler stage start");
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
    logger.info({ summary }, "Crawler stage complete");
  };
  const runParse = async (): Promise<void> => {
    logger.info("HTML page parsing start");
    const summary = await new RisaleParsingPipeline(DATA_DIR, new RisalePageParser(), logger).run();
    Object.assign(report, {
      pagesParsed: summary.pagesParsed,
      failedPages: report.failedPages + summary.failedPages
    });
    logger.info({ summary }, "HTML page parsing complete");
  };
  const runChunk = async (): Promise<void> => {
    logger.info("Chunk generation start");
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
    logger.info({ summary }, "Chunk generation complete");
  };
  const runIndex = async (): Promise<void> => {
    await new IndexPipeline(
      new ChunkIndexReader(join(DATA_DIR, "chunks")),
      new ManifestStore(join(DATA_DIR, "index")),
      logger
    ).run();
  };
  const runEmbed = async (): Promise<void> => {
    logger.info("Embedding start");
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
    logger.info({ summary }, "Embedding complete");
  };
  const runQdrant = async (): Promise<void> => {
    if (config.RISALE_QDRANT_COLLECTION === config.QDRANT_COLLECTION) {
      throw new Error("RISALE_QDRANT_COLLECTION must differ from QDRANT_COLLECTION");
    }
    logger.info({ collection: config.RISALE_QDRANT_COLLECTION }, "Qdrant upsert start");
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
    logger.info({ summary }, "Qdrant upsert complete");
  };
  const runEmbedRetry = async (): Promise<void> => {
    const manifestStore = new EmbeddingIndexManifestStore(join(DATA_DIR, "index"));
    const chunkReader = new QdrantChunkPayloadReader(join(DATA_DIR, "chunks"));
    const reporter = new RisaleEmbeddingFailureReporter(
      join(process.cwd(), "reports", "risale-embedding-failures"),
      new OpenAiTokenCounter(),
      config.EMBEDDING_MAX_INPUT_TOKENS
    );
    const before = await manifestStore.loadChunks();
    const chunks = await chunkReader.readByChunkId();
    const initialReport = reporter.analyze(before, chunks);
    const initialPaths =
      initialReport.totalFailed > 0
        ? await reporter.write(initialReport, "embedding-failures-initial")
        : null;
    logger.info(
      {
        totalFailed: initialReport.totalFailed,
        categories: initialReport.categories,
        paths: initialPaths
      },
      "Risale embedding failure report written"
    );
    const retryErrors = new Map<string, RisaleEmbeddingFailure>();
    const summary = await new EmbeddingPipeline(
      manifestStore,
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
      logger,
      () => new Date(),
      (failedChunks, error) => {
        const classified = classifyEmbeddingError(error);
        for (const failed of failedChunks) {
          const chunk = chunks.get(failed.manifest.chunkId);
          const pageValue =
            chunk?.metadata.canonicalUrl?.match(/[?&]pageNo=(\d+)/)?.[1] ??
            chunk?.metadata.sourceFile.match(/page-(\d+)/)?.[1];
          retryErrors.set(failed.manifest.chunkId, {
            book: chunk?.metadata.book ?? chunk?.metadata.headingPath[0] ?? "Unknown",
            page: pageValue === undefined ? null : Number.parseInt(pageValue, 10),
            chunkId: failed.manifest.chunkId,
            ...classified
          });
        }
      }
    ).run();
    const after = await manifestStore.loadChunks();
    const beforePending = new Set(
      before.filter((entry) => entry.embeddingStatus === "pending").map((entry) => entry.chunkId)
    );
    const newlyEmbedded = new Set(
      after
        .filter((entry) => beforePending.has(entry.chunkId) && entry.embeddingStatus === "embedded")
        .map((entry) => entry.chunkId)
    );
    const remainingBase = reporter.analyze(after, chunks);
    const remaining = reporter.build(
      remainingBase.failures.map((failure) => retryErrors.get(failure.chunkId) ?? failure)
    );
    const finalPaths = await reporter.write(remaining);
    logger.info(
      {
        summary,
        newlyEmbedded: newlyEmbedded.size,
        remaining: remaining.totalFailed,
        paths: finalPaths
      },
      "Embedding retry complete"
    );
    if (newlyEmbedded.size === 0) return;
    logger.info({ vectors: newlyEmbedded.size }, "Qdrant retry upsert start");
    const qdrantSummary = await new QdrantSyncPipeline(
      new QdrantIndexStore(join(DATA_DIR, "index")),
      new EmbeddingVectorReader(join(DATA_DIR, "embeddings")),
      chunkReader,
      new RestQdrantVectorClient(config.QDRANT_URL, config.QDRANT_API_KEY),
      {
        collection: config.RISALE_QDRANT_COLLECTION,
        batchSize: Math.max(1, config.QDRANT_BATCH_SIZE),
        concurrency: Math.max(1, config.QDRANT_CONCURRENCY),
        retries: config.QDRANT_RETRIES,
        resume: true
      },
      logger
    ).syncChunkIds(newlyEmbedded);
    logger.info({ summary: qdrantSummary }, "Qdrant retry upsert complete");
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
    const run = phase === "embed-retry" ? runEmbedRetry : phases[phase];
    if (run === undefined)
      throw new Error(
        "Usage: pnpm risale <ingest|crawl|parse|chunk|index|embed|embed-retry|qdrant>"
      );
    await run();
  }
  if (phase === "embed-retry") return;
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
