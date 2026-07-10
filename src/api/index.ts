import { join } from "node:path";
import pino from "pino";
import { readTextFile } from "../utils/fs.js";
import { loadConfig } from "../config/env.js";
import { verifyQdrantCollectionAccess } from "../qdrant/clientConfig.js";
import {
  assertApiStartupEnvironment,
  createApiServer,
  runtimeConfigFromEnv,
  sanitizedUrl
} from "./server.js";

const logger = pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

const readPackageVersion = async (): Promise<string> => {
  const content = await readTextFile(join(process.cwd(), "package.json"));
  const parsed = JSON.parse(content) as unknown;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }
  return "unknown";
};

const main = async (): Promise<void> => {
  assertApiStartupEnvironment();
  const appConfig = loadConfig();
  logger.level = appConfig.LOG_LEVEL;
  logger.info(
    {
      qdrantUrl: sanitizedUrl(appConfig.QDRANT_URL),
      qdrantCollection: appConfig.QDRANT_COLLECTION,
      qdrantApiKeyPresent: Boolean(appConfig.QDRANT_API_KEY?.trim()),
      nodeVersion: process.version
    },
    "Runtime configuration resolved"
  );
  await verifyQdrantCollectionAccess(
    appConfig.QDRANT_URL,
    appConfig.QDRANT_API_KEY,
    appConfig.QDRANT_COLLECTION
  );
  logger.info({ qdrantCollection: appConfig.QDRANT_COLLECTION }, "Qdrant collection is accessible");
  const runtime = runtimeConfigFromEnv(appConfig);
  const server = await createApiServer({
    appConfig,
    packageVersion: await readPackageVersion()
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Stopping API server");
    try {
      await server.close();
      logger.info("API server stopped");
    } catch (error: unknown) {
      logger.error({ err: error, signal }, "API server shutdown failed");
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await server.listen({ host: runtime.host, port: runtime.port });
  logger.info(
    {
      host: runtime.host,
      port: runtime.port,
      prefix: runtime.prefix,
      docs: "/docs"
    },
    "API server started"
  );
};

main().catch((error: unknown) => {
  logger.error({ err: error }, "API server failed");
  process.exitCode = 1;
});
