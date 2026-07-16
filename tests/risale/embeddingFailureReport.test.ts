import { describe, expect, it } from "vitest";
import { OpenAiTokenCounter } from "../../src/chunking/tokenCounter.js";
import type { EmbeddingChunkManifestEntry } from "../../src/embedding/types.js";
import type { QdrantChunkPayloadFile } from "../../src/qdrant/types.js";
import {
  RisaleEmbeddingFailureReporter,
  classifyEmbeddingError
} from "../../src/risale/embeddingFailureReport.js";

const manifest = (chunkId: string, contentHash: string): EmbeddingChunkManifestEntry => ({
  chunkId,
  documentId: "document-1",
  chunkIndex: 0,
  tokenCount: 10,
  contentHash,
  embeddingStatus: "pending",
  embeddedAt: null,
  vectorId: null
});

const chunk = (chunkId: string, markdown: string): QdrantChunkPayloadFile => ({
  metadata: {
    id: chunkId,
    sourceFile: "book-01/page-0002.md",
    url: "https://www.erisale.com/index.jsp?bookId=1&locale=tr&pageNo=2",
    title: "Sözler",
    language: "tr",
    headingPath: ["Sözler"],
    chunkIndex: 0,
    totalChunks: 1,
    tokenCount: 10,
    contentHash: "hash",
    book: "Sözler",
    canonicalUrl: "https://www.erisale.com/index.jsp?bookId=1&locale=tr&pageNo=2"
  },
  markdown,
  plainText: markdown
});

describe("RisaleEmbeddingFailureReporter", () => {
  it("reports every pending chunk with source context and deterministic categories", () => {
    const reporter = new RisaleEmbeddingFailureReporter(
      "reports",
      new OpenAiTokenCounter(),
      20,
      () => new Date("2026-07-15T00:00:00.000Z")
    );
    const manifests = [
      manifest("duplicate", "same"),
      manifest("copy", "same"),
      manifest("empty", "empty")
    ];
    const chunks = new Map<string, QdrantChunkPayloadFile>([
      ["duplicate", chunk("duplicate", "short text")],
      ["copy", chunk("copy", "short text")],
      ["empty", chunk("empty", "")]
    ]);

    const report = reporter.analyze(manifests, chunks);

    expect(report.totalFailed).toBe(3);
    expect(report.categories["Duplicate chunk"]).toBe(2);
    expect(report.categories["Empty chunk"]).toBe(1);
    expect(report.failures[0]).toMatchObject({ book: "Sözler", page: 2, retryable: true });
  });

  it("classifies retryable provider failures", () => {
    expect(
      classifyEmbeddingError(Object.assign(new Error("rate limit reached"), { status: 429 }))
    ).toMatchObject({ category: "Rate limit", retryable: true });
    expect(classifyEmbeddingError(new Error("request timed out"))).toMatchObject({
      category: "Timeout",
      retryable: true
    });
  });
});
