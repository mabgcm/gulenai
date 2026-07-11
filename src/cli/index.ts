import { buildDefaultSourceConfig, loadConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { formatAnswer } from "../answer/answerFormatter.js";
import { OpenAiChatCompletionClient } from "../answer/openAiChatClient.js";
import { StrictRagAnswerEngine } from "../answer/strictRagAnswerEngine.js";
import { ChunkingPipeline } from "../chunking/chunkingPipeline.js";
import { MarkdownChunker } from "../chunking/chunker.js";
import { ChunkStore } from "../chunking/chunkStore.js";
import { MarkdownDocumentReader } from "../chunking/markdownDocumentReader.js";
import { OpenAiTokenCounter } from "../chunking/tokenCounter.js";
import { CitationEngine } from "../citations/citationEngine.js";
import { formatCitedAnswerCli } from "../citations/citationFormatter.js";
import { CitationStore } from "../citations/citationStore.js";
import { Crawler } from "../crawler/crawler.js";
import { PlaywrightFetcher } from "../crawler/fetcher.js";
import { CrawlQualityReporter } from "../crawlQuality/crawlQualityReporter.js";
import { RestQdrantDiagnosticsClient } from "../diagnostics/qdrantDiagnosticsClient.js";
import { RetrievalDiagnostics } from "../diagnostics/retrievalDiagnostics.js";
import { RetrievalAuditReporter } from "../diagnostics/retrievalAudit.js";
import {
  formatDiagnostics,
  formatValidationSearch,
  RetrievalValidationReportWriter
} from "../diagnostics/retrievalValidationReport.js";
import { PerformanceReportWriter } from "../diagnostics/performanceReport.js";
import { SearchValidator } from "../diagnostics/validateSearch.js";
import { ChunkPayloadReader } from "../embedding/chunkPayloadReader.js";
import { OpenAiEmbeddingClient } from "../embedding/embeddingClient.js";
import { EmbeddingPipeline } from "../embedding/embeddingPipeline.js";
import { EmbeddingVectorStore } from "../embedding/embeddingVectorStore.js";
import { EmbeddingIndexManifestStore } from "../embedding/indexManifestStore.js";
import { ArticleExtractor } from "../extract/articleExtractor.js";
import { CleanDocumentStore } from "../extract/cleanDocumentStore.js";
import { ExtractionPipeline } from "../extract/extractionPipeline.js";
import { RawDocumentReader } from "../extract/rawDocumentReader.js";
import { ChunkIndexReader } from "../indexing/chunkIndexReader.js";
import { IndexPipeline } from "../indexing/indexPipeline.js";
import { ManifestStore } from "../indexing/manifestStore.js";
import { formatIndexStatus } from "../indexing/statusFormatter.js";
import { DatasetInspectionReport } from "../inspection/datasetInspectionReport.js";
import { CleanHtmlReader } from "../markdown/cleanHtmlReader.js";
import { MarkdownConverter } from "../markdown/markdownConverter.js";
import { MarkdownPipeline } from "../markdown/markdownPipeline.js";
import { MarkdownStore } from "../markdown/markdownStore.js";
import { PromptAssembler } from "../prompt/promptAssembler.js";
import { PromptStore } from "../prompt/promptStore.js";
import { EmbeddingVectorReader, QdrantChunkPayloadReader } from "../qdrant/qdrantDataReaders.js";
import { RestQdrantVectorClient } from "../qdrant/qdrantClient.js";
import { QdrantIndexStore } from "../qdrant/qdrantIndexStore.js";
import { QdrantSyncPipeline } from "../qdrant/qdrantPipeline.js";
import { formatQdrantStatus } from "../qdrant/statusFormatter.js";
import { ChunkContentStore } from "../search/chunkContentStore.js";
import { OpenAiQueryEmbeddingClient } from "../search/queryEmbeddingClient.js";
import { QdrantVectorSearchClient } from "../search/qdrantSearchClient.js";
import { RetrievalEngine } from "../search/retrievalEngine.js";
import { formatSearchResults } from "../search/searchFormatter.js";
import type { SearchFilters, SearchOptions } from "../search/types.js";
import { CrawlStore } from "../storage/crawlStore.js";

const crawl = async (): Promise<void> => {
  const config = loadConfig();
  const languages = collectFlagValues(process.argv.slice(3), "--language");
  const source = {
    ...buildDefaultSourceConfig(config),
    languages:
      languages.length > 0
        ? languages.map((language) => language.toLowerCase())
        : config.CRAWL_LANGUAGES
  };
  const store = new CrawlStore();
  const fetcher = new PlaywrightFetcher(source.userAgent);
  const crawler = new Crawler(source, fetcher, store, logger);

  try {
    const startedAt = Date.now();
    const result = await crawler.run();
    await new PerformanceReportWriter().record(
      "crawl",
      Date.now() - startedAt,
      result.savedPagesThisRun,
      "pages"
    );
    logger.info(result, "Crawl complete");
  } finally {
    await fetcher.close();
  }
};

const reset = async (): Promise<void> => {
  const store = new CrawlStore();
  await store.reset();
  logger.info("Data directories reset");
};

const extract = async (): Promise<void> => {
  const pipeline = new ExtractionPipeline(
    new RawDocumentReader(),
    new ArticleExtractor(),
    new CleanDocumentStore(),
    logger
  );
  const result = await pipeline.run();
  logger.info(result, "Extraction complete");
};

const markdown = async (): Promise<void> => {
  const pipeline = new MarkdownPipeline(
    new CleanHtmlReader(),
    new MarkdownConverter(),
    new MarkdownStore(),
    logger
  );
  const result = await pipeline.run();
  logger.info(result, "Markdown conversion complete");
};

const chunk = async (): Promise<void> => {
  const config = loadConfig();
  const pipeline = new ChunkingPipeline(
    new MarkdownDocumentReader(),
    new MarkdownChunker(
      {
        targetTokens: config.CHUNK_SIZE_TOKENS,
        maxTokens: config.CHUNK_MAX_TOKENS,
        overlapTokens: config.CHUNK_OVERLAP_TOKENS,
        embeddingMaxTokens: config.EMBEDDING_MAX_INPUT_TOKENS
      },
      new OpenAiTokenCounter()
    ),
    new ChunkStore(),
    logger
  );
  const result = await pipeline.run();
  logger.info(result, "Chunking complete");
};

const index = async (): Promise<void> => {
  const pipeline = new IndexPipeline(new ChunkIndexReader(), new ManifestStore(), logger);
  const startedAt = Date.now();
  const summary = await pipeline.run();
  await new PerformanceReportWriter().record(
    "index",
    Date.now() - startedAt,
    summary.totalChunks,
    "chunks"
  );
  process.stdout.write(`${formatIndexStatus(summary)}\n`);
};

const embed = async (): Promise<void> => {
  const config = loadConfig();
  const resume = process.argv.includes("--resume");
  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const pipeline = new EmbeddingPipeline(
    new EmbeddingIndexManifestStore(),
    new ChunkPayloadReader(),
    new EmbeddingVectorStore(),
    new OpenAiEmbeddingClient(config.OPENAI_API_KEY, model, config.EMBEDDING_RETRIES, logger),
    {
      model,
      batchSize: Math.max(1, config.EMBEDDING_BATCH_SIZE),
      concurrency: Math.max(1, config.EMBEDDING_CONCURRENCY),
      retries: config.EMBEDDING_RETRIES,
      resume
    },
    logger
  );
  const startedAt = Date.now();
  const result = await pipeline.run();
  await new PerformanceReportWriter().record(
    "embed",
    Date.now() - startedAt,
    result.completed,
    "vectors"
  );
  logger.info(result, "Embedding complete");
};

const status = async (): Promise<void> => {
  const store = new ManifestStore();
  const summary = await store.loadSummary();
  if (summary === null) {
    throw new Error("No index summary found. Run `pnpm index` first.");
  }
  process.stdout.write(`${formatIndexStatus(summary)}\n`);
};

const inspect = async (): Promise<void> => {
  const outputPath = await new DatasetInspectionReport().write();
  process.stdout.write(`Inspection report written: ${outputPath}\n`);
};

const crawlQualityReport = async (): Promise<void> => {
  const store = new CrawlStore();
  const state = await store.loadQualityState();
  if (state === null) {
    throw new Error("No crawl quality decisions found. Run `pnpm crawl` first.");
  }
  const summary = await new CrawlQualityReporter().write(state.decisions);
  process.stdout.write(
    `Crawl quality report written: reports/crawl-quality.html\nIndexed pages: ${summary.indexedPages}\nSkipped pages: ${summary.skippedPages}\n`
  );
};

const qdrant = async (): Promise<void> => {
  const config = loadConfig();
  const pipeline = new QdrantSyncPipeline(
    new QdrantIndexStore(),
    new EmbeddingVectorReader(),
    new QdrantChunkPayloadReader(),
    new RestQdrantVectorClient(config.QDRANT_URL, config.QDRANT_API_KEY),
    {
      collection: config.QDRANT_COLLECTION,
      batchSize: Math.max(1, config.QDRANT_BATCH_SIZE),
      concurrency: Math.max(1, config.QDRANT_CONCURRENCY),
      retries: config.QDRANT_RETRIES,
      resume: process.argv.includes("--resume")
    },
    logger
  );

  if (process.argv[3] === "status") {
    process.stdout.write(`${formatQdrantStatus(await pipeline.status())}\n`);
    return;
  }

  const startedAt = Date.now();
  const result = await pipeline.sync();
  await new PerformanceReportWriter().record(
    "qdrant",
    Date.now() - startedAt,
    result.uploadedVectors,
    "vectors"
  );
  process.stdout.write(`${formatQdrantStatus(result)}\n`);
};

const valueAfterFlag = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};

const collectFlagValues = (args: readonly string[], flag: string): readonly string[] => {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
      index += 1;
    }
  }
  return values;
};

const parseNumberFlag = (
  args: readonly string[],
  flag: string,
  fallback: number,
  validate: (value: number) => boolean
): number => {
  const value = valueAfterFlag(args, flag);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !validate(parsed)) {
    throw new Error(`Invalid ${flag} value`);
  }

  return parsed;
};

const parseSearchOptions = (args: readonly string[]): { query: string; options: SearchOptions } => {
  const config = loadConfig();
  const flagNames = new Set([
    "--topK",
    "--threshold",
    "--maxContextTokens",
    "--language",
    "--documentId",
    "--title",
    "--url",
    "--sourceFile"
  ]);
  const queryParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === undefined) {
      continue;
    }
    if (flagNames.has(item)) {
      index += 1;
      continue;
    }
    queryParts.push(item);
  }

  const filters: SearchFilters = {};
  const language = valueAfterFlag(args, "--language");
  const documentId = valueAfterFlag(args, "--documentId");
  const title = valueAfterFlag(args, "--title");
  const url = valueAfterFlag(args, "--url");
  const sourceFile = valueAfterFlag(args, "--sourceFile");
  if (language !== undefined) {
    Object.assign(filters, { language });
  }
  if (documentId !== undefined) {
    Object.assign(filters, { documentId });
  }
  if (title !== undefined) {
    Object.assign(filters, { title });
  }
  if (url !== undefined) {
    Object.assign(filters, { url });
  }
  if (sourceFile !== undefined) {
    Object.assign(filters, { sourceFile });
  }

  return {
    query: queryParts.join(" ").trim(),
    options: {
      topK: parseNumberFlag(
        args,
        "--topK",
        config.SEARCH_TOP_K,
        (value) => Number.isInteger(value) && value > 0
      ),
      threshold: parseNumberFlag(
        args,
        "--threshold",
        config.SEARCH_SCORE_THRESHOLD,
        (value) => value >= 0 && value <= 1
      ),
      filters
    }
  };
};

const search = async (): Promise<void> => {
  const config = loadConfig();
  const { query, options } = parseSearchOptions(process.argv.slice(3));
  if (query.length === 0) {
    throw new Error('Usage: pnpm search "user question" [--topK 8] [--threshold 0.5]');
  }

  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const engine = new RetrievalEngine(
    config.QDRANT_COLLECTION,
    new OpenAiQueryEmbeddingClient(config.OPENAI_API_KEY, model),
    new QdrantVectorSearchClient(config.QDRANT_URL, config.QDRANT_API_KEY)
  );

  process.stdout.write(`${formatSearchResults(await engine.search(query, options))}\n`);
};

const prompt = async (): Promise<void> => {
  const config = loadConfig();
  const args = process.argv.slice(3);
  const { query, options } = parseSearchOptions(args);
  if (query.length === 0) {
    throw new Error('Usage: pnpm prompt "user question" [--topK 8] [--threshold 0.5]');
  }

  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const engine = new RetrievalEngine(
    config.QDRANT_COLLECTION,
    new OpenAiQueryEmbeddingClient(config.OPENAI_API_KEY, model),
    new QdrantVectorSearchClient(config.QDRANT_URL, config.QDRANT_API_KEY)
  );
  const maxContextTokens = parseNumberFlag(
    args,
    "--maxContextTokens",
    config.PROMPT_MAX_CONTEXT_TOKENS,
    (value) => Number.isInteger(value) && value >= 0
  );
  const assembled = new PromptAssembler(new OpenAiTokenCounter()).assemble(
    query,
    await engine.search(query, options),
    { maxContextTokens }
  );
  const result = await new PromptStore().write(assembled);
  process.stdout.write(
    `Prompt written:\n${result.markdownPath}\n${result.jsonPath}\nEstimated tokens: ${assembled.estimatedTokens}\nIncluded chunks: ${assembled.chunks.length}\nTrimmed chunks: ${assembled.trimmedChunks.length}\n`
  );
};

const answer = async (): Promise<void> => {
  const config = loadConfig();
  const args = process.argv.slice(3);
  const withSources = args.includes("--sources");
  const searchArgs = args.filter((arg) => arg !== "--sources");
  const { query, options } = parseSearchOptions(searchArgs);
  if (query.length === 0) {
    throw new Error('Usage: pnpm answer "question" [--sources] [--topK 8] [--threshold 0.5]');
  }

  const embeddingModel = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const engine = new RetrievalEngine(
    config.QDRANT_COLLECTION,
    new OpenAiQueryEmbeddingClient(config.OPENAI_API_KEY, embeddingModel),
    new QdrantVectorSearchClient(config.QDRANT_URL, config.QDRANT_API_KEY)
  );
  const maxContextTokens = parseNumberFlag(
    searchArgs,
    "--maxContextTokens",
    config.PROMPT_MAX_CONTEXT_TOKENS,
    (value) => Number.isInteger(value) && value >= 0
  );
  const tokenCounter = new OpenAiTokenCounter();
  const retrievedChunks = await engine.search(query, options);
  const result = await new StrictRagAnswerEngine(
    new OpenAiChatCompletionClient(config.OPENAI_API_KEY),
    tokenCounter,
    config.RETRIEVAL_AUDIT_ENABLED ? new RetrievalAuditReporter(tokenCounter) : undefined
  ).answer(query, retrievedChunks, {
    model: config.OPENAI_CHAT_MODEL,
    temperature: config.TEMPERATURE,
    maxOutputTokens: config.MAX_OUTPUT_TOKENS,
    maxContextTokens,
    ...(config.RETRIEVAL_AUDIT_ENABLED
      ? { retrievalAudit: { embeddingModel, topKRequested: options.topK } }
      : {})
  });

  if (withSources) {
    const cited = new CitationEngine().build(query, result);
    await new CitationStore().write(cited);
    process.stdout.write(`${formatCitedAnswerCli(cited)}\n`);
    return;
  }

  process.stdout.write(`${formatAnswer(query, result)}\n`);
};

const buildRetrievalDiagnostics = (): RetrievalDiagnostics => {
  const config = loadConfig();
  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  return new RetrievalDiagnostics(
    config.QDRANT_COLLECTION,
    model,
    new QdrantIndexStore(),
    new EmbeddingVectorReader(),
    new RestQdrantDiagnosticsClient(config.QDRANT_URL, config.QDRANT_API_KEY),
    new CrawlStore()
  );
};

const diagnose = async (): Promise<void> => {
  const diagnostics = await buildRetrievalDiagnostics().run();
  const outputPath = await new RetrievalValidationReportWriter().write({
    diagnostics,
    validation: null
  });
  process.stdout.write(`${formatDiagnostics(diagnostics)}\n\nReport: ${outputPath}\n`);
};

const validateSearch = async (): Promise<void> => {
  const config = loadConfig();
  const { query, options } = parseSearchOptions(process.argv.slice(3));
  if (query.length === 0) {
    throw new Error('Usage: pnpm validate-search "query" [--language tr]');
  }

  const model = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  const diagnostics = await buildRetrievalDiagnostics().run();
  const validation = await new SearchValidator(
    config.QDRANT_COLLECTION,
    new OpenAiQueryEmbeddingClient(config.OPENAI_API_KEY, model),
    new QdrantVectorSearchClient(config.QDRANT_URL, config.QDRANT_API_KEY),
    new ChunkContentStore()
  ).validate(query, options.filters, diagnostics);
  const outputPath = await new RetrievalValidationReportWriter().write({
    diagnostics,
    validation
  });
  process.stdout.write(
    `${formatValidationSearch(validation)}\n\n${formatDiagnostics(diagnostics)}\n\nReport: ${outputPath}\n`
  );
};

const main = async (): Promise<void> => {
  const command = process.argv[2];

  switch (command) {
    case "crawl":
      await crawl();
      break;
    case "reset":
      await reset();
      break;
    case "extract":
      await extract();
      break;
    case "markdown":
      await markdown();
      break;
    case "chunk":
      await chunk();
      break;
    case "index":
      await index();
      break;
    case "status":
      await status();
      break;
    case "embed":
      await embed();
      break;
    case "qdrant":
      await qdrant();
      break;
    case "search":
      await search();
      break;
    case "prompt":
      await prompt();
      break;
    case "answer":
      await answer();
      break;
    case "diagnose":
      await diagnose();
      break;
    case "validate-search":
      await validateSearch();
      break;
    case "inspect":
      await inspect();
      break;
    case "crawl-report":
      await crawlQualityReport();
      break;
    default:
      throw new Error(
        "Usage: pnpm <crawl|extract|markdown|chunk|index|status|embed|qdrant|search|prompt|answer|diagnose|validate-search|inspect|crawl-report|reset>"
      );
  }
};

main().catch((error: unknown) => {
  logger.error({ err: error }, "Command failed");
  process.exitCode = 1;
});
