import { buildDefaultSourceConfig, loadConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Crawler } from "../crawler/crawler.js";
import { PlaywrightFetcher } from "../crawler/fetcher.js";
import { ArticleExtractor } from "../extract/articleExtractor.js";
import { CleanDocumentStore } from "../extract/cleanDocumentStore.js";
import { ExtractionPipeline } from "../extract/extractionPipeline.js";
import { RawDocumentReader } from "../extract/rawDocumentReader.js";
import { CrawlStore } from "../storage/crawlStore.js";

const notImplemented = (command: string): never => {
  throw new Error(
    `${command} is planned for the next ingestion stage. The crawler is implemented in this increment.`
  );
};

const crawl = async (): Promise<void> => {
  const config = loadConfig();
  const source = buildDefaultSourceConfig(config);
  const store = new CrawlStore();
  const fetcher = new PlaywrightFetcher(source.userAgent);
  const crawler = new Crawler(source, fetcher, store, logger);

  try {
    const result = await crawler.run();
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
    case "chunk":
    case "embed":
    case "index":
    case "search":
      notImplemented(command);
      break;
    default:
      throw new Error("Usage: pnpm <crawl|extract|markdown|chunk|embed|index|search|reset>");
  }
};

main().catch((error: unknown) => {
  logger.error({ err: error }, "Command failed");
  process.exitCode = 1;
});
