import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type {
  ApiChunkResponse,
  ApiPromptResponse,
  ApiSearchRequest,
  ApiStatsResponse,
  ApiVersionResponse,
  KnowledgeApiService
} from "../../src/api/types.js";
import type { CitedAnswer, Citation } from "../../src/citations/types.js";
import type { RetrievalDiagnosticsReport } from "../../src/diagnostics/types.js";
import type { DocumentManifestEntry } from "../../src/indexing/types.js";
import { createMcpServer } from "../../src/mcp/server.js";
import type { SearchResult } from "../../src/search/types.js";

const citation: Citation = {
  id: 1,
  title: "Kırık Testi",
  url: "https://example.test",
  headingPath: ["Kitap", "İhlas"],
  chunkId: "chunk-1",
  score: 0.94,
  chunkIndex: 0,
  totalChunks: 2
};

const result: SearchResult = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  title: "Kırık Testi",
  url: "https://example.test",
  headingPath: ["Kitap", "İhlas"],
  similarityScore: 0.94,
  markdown: "İhlas metni.",
  metadata: {
    chunkIds: ["chunk-1"],
    sourceFile: "doc.md",
    language: "tr",
    chunkIndex: 0,
    totalChunks: 2,
    tokenCount: 12,
    contentHash: "hash",
    merged: false
  }
};

class FakeService implements KnowledgeApiService {
  public async stats(): Promise<ApiStatsResponse> {
    await Promise.resolve();
    return {
      documents: 1,
      chunks: 2,
      vectors: 2,
      embeddings: 2,
      indexedLanguages: ["tr"],
      collectionName: "fgulen"
    };
  }

  public async search(): Promise<readonly SearchResult[]> {
    await Promise.resolve();
    return [result];
  }

  public async prompt(): Promise<ApiPromptResponse> {
    await Promise.resolve();
    return {
      systemPrompt: "system",
      userQuestion: "İhlas nedir?",
      chunks: [],
      estimatedTokens: 10,
      trimmedChunks: [],
      promptMarkdown: "SYSTEM\nsystem"
    };
  }

  public async answer(request: ApiSearchRequest): Promise<CitedAnswer> {
    await Promise.resolve();
    return {
      question: request.question,
      answer: "İhlas cevabı. [1]",
      confidence: 94,
      citations: [citation],
      citationGroups: [{ id: 1, citations: [citation] }],
      sourceAnswer: {
        answer: "İhlas cevabı.",
        confidence: 94,
        usedChunks: [],
        ignoredChunks: [],
        estimatedTokens: 10,
        model: "test-model"
      }
    };
  }

  public async sources(): Promise<readonly Citation[]> {
    await Promise.resolve();
    return [citation];
  }

  public async document(documentId: string): Promise<DocumentManifestEntry | null> {
    await Promise.resolve();
    return documentId === "doc-1"
      ? {
          documentId: "doc-1",
          sourceFile: "doc.md",
          url: "https://example.test",
          title: "Kırık Testi",
          language: "tr",
          crawlDate: null,
          contentHash: "hash",
          totalChunks: 2,
          version: 1,
          status: "unchanged",
          lastIndexedAt: "2026-07-09T00:00:00.000Z"
        }
      : null;
  }

  public async chunk(chunkId: string): Promise<ApiChunkResponse | null> {
    await Promise.resolve();
    return chunkId === "chunk-1"
      ? {
          metadata: {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceFile: "doc.md",
            title: "Kırık Testi",
            url: "https://example.test",
            language: "tr",
            headingPath: ["Kitap", "İhlas"],
            chunkIndex: 0,
            totalChunks: 2,
            tokenCount: 12,
            contentHash: "hash",
            embeddingStatus: "embedded",
            embeddedAt: "2026-07-09T00:00:00.000Z",
            vectorId: "vector-1"
          }
        }
      : null;
  }

  public async diagnostics(): Promise<RetrievalDiagnosticsReport> {
    await Promise.resolve();
    return {
      generatedAt: "2026-07-09T00:00:00.000Z",
      collection: "fgulen",
      qdrantConnected: true,
      collectionExists: true,
      vectorCount: 2,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536,
      indexedDocuments: 1,
      indexedChunks: 2,
      embeddedChunks: 2,
      pendingChunks: 0,
      missingVectors: [],
      orphanVectors: [],
      errors: []
    };
  }

  public async version(): Promise<ApiVersionResponse> {
    await Promise.resolve();
    return {
      engineVersion: "0.1.0",
      buildDate: "2026-07-09T00:00:00.000Z",
      gitCommit: "abc123",
      supportedFeatures: ["mcp-server"]
    };
  }
}

const withClient = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const server = createMcpServer(new FakeService());
  const client = new Client({ name: "test-client", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseToolJson = (result: unknown): unknown => {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new Error("Expected MCP tool content");
  }
  const first = result.content[0] as unknown;
  if (!isRecord(first) || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected text tool result");
  }
  return JSON.parse(first.text) as unknown;
};

const resourceText = (result: unknown): string => {
  if (!isRecord(result) || !Array.isArray(result.contents)) {
    throw new Error("Expected MCP resource contents");
  }
  const first = result.contents[0] as unknown;
  if (!isRecord(first) || typeof first.text !== "string") {
    throw new Error("Expected text resource content");
  }
  return first.text;
};

describe("MCP server", () => {
  it("lists all knowledge tools", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "answer",
        "chunk",
        "document",
        "search",
        "sources"
      ]);
    });
  });

  it("calls search", async () => {
    await withClient(async (client) => {
      const output = parseToolJson(
        await client.callTool({ name: "search", arguments: { question: "İhlas?", topK: 3 } })
      );
      expect(output).toMatchObject({ results: [{ chunkId: "chunk-1" }] });
    });
  });

  it("calls answer", async () => {
    await withClient(async (client) => {
      const output = parseToolJson(
        await client.callTool({ name: "answer", arguments: { question: "İhlas?" } })
      );
      expect(output).toMatchObject({
        answer: "İhlas cevabı. [1]",
        confidence: 94,
        citations: [{ chunkId: "chunk-1" }]
      });
    });
  });

  it("calls sources", async () => {
    await withClient(async (client) => {
      const output = parseToolJson(
        await client.callTool({ name: "sources", arguments: { question: "İhlas?" } })
      );
      expect(output).toMatchObject({ citations: [{ chunkId: "chunk-1" }] });
    });
  });

  it("calls document", async () => {
    await withClient(async (client) => {
      const output = parseToolJson(
        await client.callTool({ name: "document", arguments: { documentId: "doc-1" } })
      );
      expect(output).toMatchObject({ metadata: { documentId: "doc-1" } });
    });
  });

  it("calls chunk", async () => {
    await withClient(async (client) => {
      const output = parseToolJson(
        await client.callTool({ name: "chunk", arguments: { chunkId: "chunk-1" } })
      );
      expect(output).toMatchObject({ metadata: { chunkId: "chunk-1" } });
    });
  });

  it("reads all knowledge resources", async () => {
    await withClient(async (client) => {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
        "knowledge://collection",
        "knowledge://languages",
        "knowledge://stats",
        "knowledge://version"
      ]);

      const stats = await client.readResource({ uri: "knowledge://stats" });
      expect(JSON.parse(resourceText(stats))).toMatchObject({ documents: 1 });
      const languages = await client.readResource({ uri: "knowledge://languages" });
      expect(JSON.parse(resourceText(languages))).toEqual({ languages: ["tr"] });
      const collection = await client.readResource({ uri: "knowledge://collection" });
      expect(JSON.parse(resourceText(collection))).toMatchObject({
        collectionName: "fgulen"
      });
      const version = await client.readResource({ uri: "knowledge://version" });
      expect(JSON.parse(resourceText(version))).toMatchObject({ gitCommit: "abc123" });
    });
  });

  it("gets all knowledge prompts", async () => {
    await withClient(async (client) => {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
        "answer-question",
        "citation-report",
        "search-only"
      ]);
      const prompt = await client.getPrompt({
        name: "answer-question",
        arguments: { question: "İhlas nedir?", language: "tr" }
      });
      const content = prompt.messages[0]?.content;
      expect(content?.type).toBe("text");
      expect(content?.type === "text" ? content.text : "").toContain("Use the MCP tool `answer`");
    });
  });
});
