import { describe, expect, it } from "vitest";
import { ManifestBuilder } from "../../src/indexing/manifestBuilder.js";
import type { ChunkJsonDocument, IndexManifests } from "../../src/indexing/types.js";

const chunk = (
  sourceFile: string,
  chunkIndex: number,
  contentHash: string,
  overrides: Partial<ChunkJsonDocument["metadata"]> = {}
): ChunkJsonDocument => ({
  metadata: {
    id: `${sourceFile}-${chunkIndex}-${contentHash}`,
    sourceFile,
    title: "Title",
    url: `https://fgulen.com/${sourceFile}`,
    language: "en",
    crawlDate: "2026-07-09T00:00:00.000Z",
    chunkIndex,
    totalChunks: 2,
    tokenCount: 100 + chunkIndex,
    contentHash,
    ...overrides
  },
  markdown: `# Title\n\nChunk ${chunkIndex}`,
  plainText: `Title Chunk ${chunkIndex}`
});

const build = (
  chunks: readonly ChunkJsonDocument[],
  previous: IndexManifests = { documents: [], chunks: [] }
) => new ManifestBuilder().build(chunks, previous, "2026-07-09T01:02:03.000Z");

describe("ManifestBuilder", () => {
  it("indexes a new document and marks chunks pending", () => {
    const { manifests, summary } = build([chunk("en/new.md", 0, "a"), chunk("en/new.md", 1, "b")]);

    expect(manifests.documents).toHaveLength(1);
    expect(manifests.documents[0]?.status).toBe("new");
    expect(manifests.documents[0]?.version).toBe(1);
    expect(manifests.documents[0]?.totalChunks).toBe(2);
    expect(manifests.chunks.every((entry) => entry.embeddingStatus === "pending")).toBe(true);
    expect(summary.pendingEmbeddings).toBe(2);
  });

  it("marks unchanged documents unchanged and preserves embedded chunk state", () => {
    const initial = build([chunk("en/same.md", 0, "a")]);
    const previous: IndexManifests = {
      documents: initial.manifests.documents.map((document) => ({
        ...document,
        status: "new",
        lastIndexedAt: "2026-07-09T00:00:00.000Z"
      })),
      chunks: initial.manifests.chunks.map((entry) => ({
        ...entry,
        embeddingStatus: "embedded",
        embeddedAt: "2026-07-09T00:30:00.000Z",
        vectorId: "vector-1"
      }))
    };

    const { manifests, summary } = build([chunk("en/same.md", 0, "a")], previous);

    expect(manifests.documents[0]?.status).toBe("unchanged");
    expect(manifests.documents[0]?.version).toBe(1);
    expect(manifests.documents[0]?.lastIndexedAt).toBe("2026-07-09T00:00:00.000Z");
    expect(manifests.chunks[0]?.embeddingStatus).toBe("embedded");
    expect(manifests.chunks[0]?.vectorId).toBe("vector-1");
    expect(summary.pendingEmbeddings).toBe(0);
  });

  it("marks changed documents and only changed chunks pending", () => {
    const initial = build([chunk("en/changed.md", 0, "a"), chunk("en/changed.md", 1, "b")]);
    const previous: IndexManifests = {
      documents: initial.manifests.documents,
      chunks: initial.manifests.chunks.map((entry) => ({
        ...entry,
        embeddingStatus: "embedded",
        embeddedAt: "2026-07-09T00:30:00.000Z",
        vectorId: `vector-${entry.chunkIndex}`
      }))
    };

    const changedChunk = chunk("en/changed.md", 1, "c");
    const { manifests, summary } = build([chunk("en/changed.md", 0, "a"), changedChunk], previous);

    expect(manifests.documents[0]?.status).toBe("changed");
    expect(manifests.documents[0]?.version).toBe(2);
    expect(manifests.chunks.find((entry) => entry.chunkIndex === 0)?.embeddingStatus).toBe(
      "embedded"
    );
    expect(
      manifests.chunks.find((entry) => entry.chunkId === changedChunk.metadata.id)?.embeddingStatus
    ).toBe("pending");
    expect(summary.changedDocuments).toBe(1);
    expect(summary.pendingEmbeddings).toBe(1);
  });

  it("marks deleted documents without removing history", () => {
    const initial = build([chunk("en/deleted.md", 0, "a")]);

    const { manifests, summary } = build([], initial.manifests);

    expect(manifests.documents[0]?.status).toBe("deleted");
    expect(manifests.chunks[0]?.embeddingStatus).toBe("deleted");
    expect(summary.deletedDocuments).toBe(1);
    expect(summary.totalDocuments).toBe(1);
  });

  it("generates deterministic manifests", () => {
    const input = [chunk("en/b.md", 0, "b"), chunk("en/a.md", 0, "a")];

    const first = build(input);
    const second = build(input);

    expect(first).toEqual(second);
  });
});
