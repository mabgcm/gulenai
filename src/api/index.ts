import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createApiServer, runtimeConfigFromEnv } from "./server.js";

const readPackageVersion = async (): Promise<string> => {
  const content = await readFile(join(process.cwd(), "package.json"), "utf8");
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
  const appConfig = loadConfig();
  const runtime = runtimeConfigFromEnv(appConfig);
  const server = await createApiServer({
    appConfig,
    packageVersion: await readPackageVersion()
  });

  const shutdown = async (): Promise<void> => {
    logger.info("Stopping API server");
    await server.close();
  };
  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
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
