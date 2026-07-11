import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RetrievalAuditReporter } from "../../src/diagnostics/retrievalAudit.js";
import type { SearchResult } from "../../src/search/types.js";

const result: SearchResult = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  title: "Title",
  url: null,
  headingPath: ["Book", "Heading"],
  similarityScore: 0.9,
  markdown: "context words",
  metadata: {
    chunkIds: ["chunk-1"],
    sourceFile: "doc.md",
    language: "tr",
    chunkIndex: 2,
    totalChunks: 3,
    tokenCount: 2,
    contentHash: "hash",
    merged: false
  }
};

describe("RetrievalAuditReporter", () => {
  it("writes JSON and Markdown with the exact final prompt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "retrieval-audit-"));
    const counter = { count: (text: string) => text.trim().split(/\s+/).filter(Boolean).length };
    const finalPrompt = {
      model: "chat-model",
      temperature: 0,
      maxOutputTokens: 100,
      messages: [
        { role: "system" as const, content: "exact system" },
        { role: "user" as const, content: "exact user prompt" }
      ]
    };
    await new RetrievalAuditReporter(counter, directory).write({
      question: "Question?",
      embeddingModel: "embedding-model",
      topKRequested: 8,
      retrievedChunks: [result],
      optimizedChunks: [result],
      beforeOptimizationPrompt: {
        systemPrompt: "exact system",
        userQuestion: "Question?",
        chunks: [],
        estimatedTokens: 7,
        trimmedChunks: [],
        promptMarkdown: "before prompt"
      },
      assembledPrompt: {
        systemPrompt: "exact system",
        userQuestion: "Question?",
        chunks: [
          {
            rank: 1,
            metadata: {
              title: result.title,
              url: result.url,
              headingPath: result.headingPath,
              chunkId: result.chunkId,
              chunkIds: result.metadata.chunkIds,
              documentId: result.documentId,
              similarityScore: result.similarityScore,
              sourceFile: result.metadata.sourceFile,
              language: result.metadata.language,
              tokenCount: result.metadata.tokenCount,
              chunkIndex: result.metadata.chunkIndex,
              totalChunks: result.metadata.totalChunks,
              merged: result.metadata.merged
            },
            markdown: result.markdown,
            estimatedTokens: 2
          }
        ],
        estimatedTokens: 5,
        trimmedChunks: [],
        promptMarkdown: "exact user prompt"
      },
      finalPrompt
    });

    const files = await readdir(directory);
    expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(1);
    expect(files.filter((file) => file.endsWith(".md"))).toHaveLength(1);
    const jsonName = files.find((file) => file.endsWith(".json"));
    expect(jsonName).toBeDefined();
    const report = JSON.parse(await readFile(join(directory, jsonName!), "utf8")) as unknown;
    expect(report).toMatchObject({
      embeddingModel: "embedding-model",
      topKRequested: 8,
      topKReturned: 1,
      uniqueDocumentCount: 1,
      uniqueBookCount: 1,
      totalContextTokens: 2,
      totalPromptTokens: 5,
      optimization: {
        before: { documentsRepresented: 1, booksRepresented: 1, headingDiversity: 1 },
        after: { documentsRepresented: 1, booksRepresented: 1, headingDiversity: 1 },
        duplicateReduction: 0,
        promptTokenSavings: 2,
        contextDiversityScore: 100
      },
      finalPrompt
    });
  });
});
