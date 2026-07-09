import "dotenv/config";
import { z } from "zod";
import type { SourceConfig } from "../types/source.js";

const integerFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined || value.trim() === "") {
        return fallback;
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a positive integer" });
        return z.NEVER;
      }

      return parsed;
    });

const numberFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined || value.trim() === "") {
        return fallback;
      }

      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a positive number" });
        return z.NEVER;
      }

      return parsed;
    });

const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") {
        return fallback;
      }

      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });

const csv = (fallback: readonly string[] = []) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") {
        return [...fallback];
      }

      return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    });

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("fgulen"),
  QDRANT_BATCH_SIZE: integerFromEnv(64),
  QDRANT_CONCURRENCY: integerFromEnv(2),
  QDRANT_RETRIES: integerFromEnv(3),
  SEARCH_TOP_K: integerFromEnv(8),
  SEARCH_SCORE_THRESHOLD: z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined || value.trim() === "") {
        return 0;
      }

      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a number from 0 to 1" });
        return z.NEVER;
      }
      return parsed;
    }),
  CRAWL_SEEDS: csv(["https://fgulen.com"]),
  CRAWL_ALLOWED_DOMAINS: csv(["fgulen.com"]),
  CRAWL_INCLUDE_PATHS: csv(["/"]),
  CRAWL_EXCLUDE_PATHS: csv(["/wp-admin", "/wp-login.php", "/search"]),
  CRAWL_INCLUDE_PATTERNS: csv([]),
  CRAWL_EXCLUDE_PATTERNS: csv(["[?&]start="]),
  CRAWL_LANGUAGES: csv([]),
  CRAWL_QUALITY_THRESHOLD: numberFromEnv(45),
  CRAWL_MIN_WORD_COUNT: integerFromEnv(120),
  CRAWL_DUPLICATE_SIMHASH_DISTANCE: integerFromEnv(3),
  CRAWL_MAX_PAGES: integerFromEnv(1000),
  CRAWL_MAX_DEPTH: integerFromEnv(4),
  CRAWL_CONCURRENCY: integerFromEnv(3),
  CRAWL_RETRIES: integerFromEnv(2),
  CRAWL_DELAY_MS: integerFromEnv(1000),
  CRAWL_RESPECT_ROBOTS: booleanFromEnv(true),
  CRAWL_USER_AGENT: z.string().default("GulenAIIngestionBot/0.1 (+https://fgulen.com)"),
  CHUNK_SIZE_TOKENS: integerFromEnv(800),
  CHUNK_MAX_TOKENS: integerFromEnv(1000),
  CHUNK_OVERLAP_TOKENS: integerFromEnv(150),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_BATCH_SIZE: integerFromEnv(64),
  EMBEDDING_CONCURRENCY: integerFromEnv(2),
  EMBEDDING_RETRIES: integerFromEnv(3),
  LOG_LEVEL: z.string().default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export const loadConfig = (): AppConfig => envSchema.parse(process.env);

export const buildDefaultSourceConfig = (config: AppConfig): SourceConfig => ({
  name: "fgulen",
  seeds: config.CRAWL_SEEDS,
  allowedDomains: config.CRAWL_ALLOWED_DOMAINS,
  includePaths: config.CRAWL_INCLUDE_PATHS,
  excludePaths: config.CRAWL_EXCLUDE_PATHS,
  includePatterns: config.CRAWL_INCLUDE_PATTERNS,
  excludePatterns: config.CRAWL_EXCLUDE_PATTERNS,
  languages: config.CRAWL_LANGUAGES,
  qualityThreshold: config.CRAWL_QUALITY_THRESHOLD,
  minWordCount: config.CRAWL_MIN_WORD_COUNT,
  duplicateSimHashDistance: config.CRAWL_DUPLICATE_SIMHASH_DISTANCE,
  maxPages: config.CRAWL_MAX_PAGES,
  maxDepth: config.CRAWL_MAX_DEPTH,
  concurrency: Math.max(1, config.CRAWL_CONCURRENCY),
  retries: config.CRAWL_RETRIES,
  crawlDelayMs: config.CRAWL_DELAY_MS,
  respectRobots: config.CRAWL_RESPECT_ROBOTS,
  userAgent: config.CRAWL_USER_AGENT
});
