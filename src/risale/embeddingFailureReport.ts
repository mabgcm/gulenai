import { join } from "node:path";
import type { OpenAiTokenCounter } from "../chunking/tokenCounter.js";
import type { EmbeddingChunkManifestEntry } from "../embedding/types.js";
import type { QdrantChunkPayloadFile } from "../qdrant/types.js";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";

export type EmbeddingFailureCategory =
  | "OpenAI error"
  | "Timeout"
  | "Rate limit"
  | "Token limit"
  | "Empty chunk"
  | "Duplicate chunk"
  | "Serialization"
  | "Other";

export interface RisaleEmbeddingFailure {
  readonly book: string;
  readonly page: number | null;
  readonly chunkId: string;
  readonly category: EmbeddingFailureCategory;
  readonly reason: string;
  readonly retryable: boolean;
}

export interface RisaleEmbeddingFailureReport {
  readonly generatedAt: string;
  readonly totalFailed: number;
  readonly categories: Readonly<Record<EmbeddingFailureCategory, number>>;
  readonly failures: readonly RisaleEmbeddingFailure[];
}

const categories: readonly EmbeddingFailureCategory[] = [
  "OpenAI error",
  "Timeout",
  "Rate limit",
  "Token limit",
  "Empty chunk",
  "Duplicate chunk",
  "Serialization",
  "Other"
];

export const classifyEmbeddingError = (
  error: unknown
): Pick<RisaleEmbeddingFailure, "category" | "reason" | "retryable"> => {
  const record =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  if (status === 429 || normalized.includes("rate limit")) {
    return { category: "Rate limit", reason: message, retryable: true };
  }
  if (
    code.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    return { category: "Timeout", reason: message, retryable: true };
  }
  if (normalized.includes("maximum context") || normalized.includes("token limit")) {
    return { category: "Token limit", reason: message, retryable: false };
  }
  if (error instanceof SyntaxError || normalized.includes("serializ")) {
    return { category: "Serialization", reason: message, retryable: false };
  }
  if (status !== null || record.name === "APIError") {
    return {
      category: "OpenAI error",
      reason: message,
      retryable: status === null || status === 408 || status === 409 || status >= 500
    };
  }
  return { category: "Other", reason: message, retryable: true };
};

const pageFor = (chunk: QdrantChunkPayloadFile): number | null => {
  const fromUrl = chunk.metadata.canonicalUrl?.match(/[?&]pageNo=(\d+)/)?.[1];
  const fromFile = chunk.metadata.sourceFile.match(/page-(\d+)/)?.[1];
  const value = fromUrl ?? fromFile;
  return value === undefined ? null : Number.parseInt(value, 10);
};

export class RisaleEmbeddingFailureReporter {
  public constructor(
    private readonly reportsDir: string,
    private readonly tokenCounter: OpenAiTokenCounter,
    private readonly maxTokens: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public analyze(
    manifests: readonly EmbeddingChunkManifestEntry[],
    chunks: ReadonlyMap<string, QdrantChunkPayloadFile>
  ): RisaleEmbeddingFailureReport {
    const contentHashCounts = new Map<string, number>();
    for (const manifest of manifests) {
      contentHashCounts.set(
        manifest.contentHash,
        (contentHashCounts.get(manifest.contentHash) ?? 0) + 1
      );
    }
    const failures = manifests
      .filter((manifest) => manifest.embeddingStatus === "pending")
      .map((manifest): RisaleEmbeddingFailure => {
        const chunk = chunks.get(manifest.chunkId);
        if (chunk === undefined) {
          return {
            book: "Unknown",
            page: null,
            chunkId: manifest.chunkId,
            category: "Serialization",
            reason: "Chunk payload is missing or could not be deserialized",
            retryable: false
          };
        }
        const text = [chunk.markdown, chunk.plainText].join("\n\n").trim();
        const base = {
          book: chunk.metadata.book ?? chunk.metadata.headingPath[0] ?? "Unknown",
          page: pageFor(chunk),
          chunkId: manifest.chunkId
        };
        if (text.length === 0) {
          return {
            ...base,
            category: "Empty chunk",
            reason: "Embedding input is empty",
            retryable: false
          };
        }
        const tokenCount = this.tokenCounter.count(text);
        if (tokenCount > this.maxTokens) {
          return {
            ...base,
            category: "Token limit",
            reason: `Embedding input has ${tokenCount} tokens; limit is ${this.maxTokens}`,
            retryable: false
          };
        }
        if ((contentHashCounts.get(manifest.contentHash) ?? 0) > 1) {
          return {
            ...base,
            category: "Duplicate chunk",
            reason:
              "Content hash is shared by another indexed chunk; no original API exception was persisted",
            retryable: true
          };
        }
        return {
          ...base,
          category: "Other",
          reason: "Original batch exception was not persisted by the previous embedding pipeline",
          retryable: true
        };
      });
    return this.build(failures);
  }

  public build(failures: readonly RisaleEmbeddingFailure[]): RisaleEmbeddingFailureReport {
    const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<
      EmbeddingFailureCategory,
      number
    >;
    for (const failure of failures) counts[failure.category] += 1;
    return {
      generatedAt: this.now().toISOString(),
      totalFailed: failures.length,
      categories: counts,
      failures
    };
  }

  public async write(
    report: RisaleEmbeddingFailureReport,
    basename = "embedding-failures"
  ): Promise<{ json: string; markdown: string }> {
    await ensureDir(this.reportsDir);
    const json = join(this.reportsDir, `${basename}.json`);
    const markdown = join(this.reportsDir, `${basename}.md`);
    const rows = report.failures.map(
      (failure) =>
        `| ${failure.book.replaceAll("|", "\\|")} | ${failure.page ?? "—"} | ${failure.chunkId} | ${failure.category}: ${failure.reason.replaceAll("|", "\\|")} | ${failure.retryable ? "yes" : "no"} |`
    );
    const summary = categories.map((category) => `- ${category}: ${report.categories[category]}`);
    await writeJson(json, report);
    await writeTextFile(
      markdown,
      [
        "# Risale Embedding Failures",
        "",
        `Generated: ${report.generatedAt}`,
        `Total failed: ${report.totalFailed}`,
        "",
        ...summary,
        "",
        "| Book | Page | Chunk ID | Reason | Retryable |",
        "| --- | ---: | --- | --- | --- |",
        ...rows,
        ""
      ].join("\n")
    );
    return { json, markdown };
  }
}
