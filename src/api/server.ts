import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { registerErrorHandler } from "./middleware/errors.js";
import { registerRequestLogger } from "./middleware/requestLogger.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { knowledgeRoutes } from "./routes/knowledgeRoutes.js";
import { DefaultKnowledgeApiService } from "./services/knowledgeApiService.js";
import type { ApiDependencies, ApiRuntimeConfig, KnowledgeApiService } from "./types.js";

export interface CreateApiServerOptions {
  readonly appConfig: AppConfig;
  readonly packageVersion: string;
  readonly service?: KnowledgeApiService;
  readonly production?: boolean;
  readonly enableLogger?: boolean;
}

const requiredApiEnvironmentVariables = [
  "OPENAI_API_KEY",
  "QDRANT_URL",
  "QDRANT_COLLECTION"
] as const;

export const assertApiStartupEnvironment = (environment: NodeJS.ProcessEnv = process.env): void => {
  const missing = requiredApiEnvironmentVariables.filter(
    (name) => !environment[name]?.trim()
  );

  if (missing.length > 0) {
    throw new Error(`Missing required API environment variables: ${missing.join(", ")}`);
  }
};

export const sanitizedUrl = (value: string): string => {
  const url = new URL(value);
  if (url.username.length > 0) {
    url.username = "[redacted]";
  }
  if (url.password.length > 0) {
    url.password = "[redacted]";
  }
  for (const name of url.searchParams.keys()) {
    url.searchParams.set(name, "[redacted]");
  }
  return url.toString();
};

export const runtimeConfigFromEnv = (
  appConfig: AppConfig,
  production = process.env.NODE_ENV === "production",
  environment: NodeJS.ProcessEnv = process.env
): ApiRuntimeConfig => ({
  host: environment.HOST?.trim() || (production ? "0.0.0.0" : appConfig.HOST),
  port: appConfig.PORT,
  prefix: appConfig.API_PREFIX.trim() === "/" ? "" : appConfig.API_PREFIX.trim(),
  version: appConfig.API_VERSION,
  corsOrigin: appConfig.CORS_ORIGIN,
  bodyLimitBytes: appConfig.API_BODY_LIMIT_BYTES,
  production
});

const corsOrigin = (origin: string): string | boolean | string[] =>
  origin.trim() === "*"
    ? true
    : origin
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

export const createApiServer = async (
  options: CreateApiServerOptions
): Promise<FastifyInstance> => {
  const runtime = runtimeConfigFromEnv(options.appConfig, options.production);
  const server = fastify({
    logger: options.enableLogger === false ? false : { level: options.appConfig.LOG_LEVEL },
    bodyLimit: runtime.bodyLimitBytes
  });
  const service =
    options.service ?? new DefaultKnowledgeApiService(options.appConfig, options.packageVersion);
  const deps: ApiDependencies = { service };

  registerErrorHandler(server, runtime.production);
  registerRequestLogger(server);

  await server.register(cors, { origin: corsOrigin(runtime.corsOrigin) });
  await server.register(swagger, {
    openapi: {
      info: {
        title: "GulenAI Knowledge Engine API",
        description: "REST API for search, prompt assembly, strict RAG answers, and citations.",
        version: runtime.version
      },
      servers: [{ url: runtime.prefix.length > 0 ? runtime.prefix : "/" }]
    }
  });
  await server.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });

  await server.register(
    async (routes) => {
      await healthRoutes(runtime)(routes, deps);
      await knowledgeRoutes(routes, deps);
    },
    runtime.prefix.length > 0 ? { prefix: runtime.prefix } : {}
  );

  return server;
};
