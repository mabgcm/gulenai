import type {
  ChunkJsonDocument,
  ChunkManifestEntry,
  DocumentManifestEntry,
  DocumentStatus,
  EmbeddingStatus,
  IndexManifests,
  IndexSummary
} from "./types.js";
import { sha256, shortHash } from "../utils/hash.js";

interface GroupedDocument {
  readonly sourceFile: string;
  readonly chunks: readonly ChunkJsonDocument[];
}

const nullableString = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim().length === 0 ? null : value;

const documentIdForSource = (sourceFile: string): string => shortHash(sourceFile);

const documentHash = (chunks: readonly ChunkJsonDocument[]): string =>
  sha256(
    chunks
      .map(
        (chunk) => `${chunk.metadata.chunkIndex}:${chunk.metadata.id}:${chunk.metadata.contentHash}`
      )
      .sort()
      .join("\n")
  );

const groupChunks = (chunks: readonly ChunkJsonDocument[]): readonly GroupedDocument[] => {
  const groups = new Map<string, ChunkJsonDocument[]>();

  for (const chunk of chunks) {
    const existing = groups.get(chunk.metadata.sourceFile) ?? [];
    existing.push(chunk);
    groups.set(chunk.metadata.sourceFile, existing);
  }

  return [...groups.entries()]
    .map(([sourceFile, documentChunks]) => ({
      sourceFile,
      chunks: [...documentChunks].sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex)
    }))
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
};

const documentStatus = (
  previous: DocumentManifestEntry | undefined,
  nextHash: string
): DocumentStatus => {
  if (previous === undefined || previous.status === "deleted") {
    return "new";
  }

  return previous.contentHash === nextHash ? "unchanged" : "changed";
};

const nextVersion = (
  previous: DocumentManifestEntry | undefined,
  status: DocumentStatus
): number => {
  if (previous === undefined) {
    return 1;
  }

  return status === "changed" ? previous.version + 1 : previous.version;
};

const preserveEmbeddingStatus = (
  previous: ChunkManifestEntry | undefined
): Pick<ChunkManifestEntry, "embeddingStatus" | "embeddedAt" | "vectorId"> => {
  if (previous === undefined || previous.embeddingStatus === "deleted") {
    return { embeddingStatus: "pending", embeddedAt: null, vectorId: null };
  }

  return {
    embeddingStatus: previous.embeddingStatus,
    embeddedAt: previous.embeddedAt,
    vectorId: previous.vectorId
  };
};

export class ManifestBuilder {
  public build(
    chunkJson: readonly ChunkJsonDocument[],
    previous: IndexManifests,
    indexedAt: string
  ): { manifests: IndexManifests; summary: IndexSummary } {
    const previousDocumentsById = new Map(
      previous.documents.map((document) => [document.documentId, document])
    );
    const previousChunksById = new Map(previous.chunks.map((chunk) => [chunk.chunkId, chunk]));
    const currentDocumentIds = new Set<string>();
    const currentChunkIds = new Set<string>();
    const documents: DocumentManifestEntry[] = [];
    const chunks: ChunkManifestEntry[] = [];

    for (const group of groupChunks(chunkJson)) {
      const firstChunk = group.chunks[0];
      if (firstChunk === undefined) {
        continue;
      }

      const documentId = documentIdForSource(group.sourceFile);
      const contentHash = documentHash(group.chunks);
      const previousDocument = previousDocumentsById.get(documentId);
      const status = documentStatus(previousDocument, contentHash);
      const document: DocumentManifestEntry = {
        documentId,
        sourceFile: group.sourceFile,
        url: nullableString(firstChunk.metadata.url),
        title: nullableString(firstChunk.metadata.title),
        language: nullableString(firstChunk.metadata.language),
        crawlDate: nullableString(firstChunk.metadata.crawlDate),
        contentHash,
        totalChunks: group.chunks.length,
        version: nextVersion(previousDocument, status),
        status,
        lastIndexedAt:
          status === "unchanged" ? (previousDocument?.lastIndexedAt ?? indexedAt) : indexedAt
      };
      documents.push(document);
      currentDocumentIds.add(documentId);

      for (const chunk of group.chunks) {
        const previousChunk = previousChunksById.get(chunk.metadata.id);
        const preserved =
          previousChunk?.contentHash === chunk.metadata.contentHash
            ? preserveEmbeddingStatus(previousChunk)
            : { embeddingStatus: "pending" as EmbeddingStatus, embeddedAt: null, vectorId: null };

        chunks.push({
          chunkId: chunk.metadata.id,
          documentId,
          chunkIndex: chunk.metadata.chunkIndex,
          tokenCount: chunk.metadata.tokenCount,
          contentHash: chunk.metadata.contentHash,
          ...preserved
        });
        currentChunkIds.add(chunk.metadata.id);
      }
    }

    for (const previousDocument of previous.documents) {
      if (!currentDocumentIds.has(previousDocument.documentId)) {
        documents.push({
          ...previousDocument,
          status: "deleted",
          lastIndexedAt:
            previousDocument.status === "deleted" ? previousDocument.lastIndexedAt : indexedAt
        });
      }
    }

    for (const previousChunk of previous.chunks) {
      if (!currentChunkIds.has(previousChunk.chunkId)) {
        const documentDeleted = documents.some(
          (document) =>
            document.documentId === previousChunk.documentId && document.status === "deleted"
        );
        if (documentDeleted) {
          chunks.push({
            ...previousChunk,
            embeddingStatus: "deleted",
            embeddedAt: previousChunk.embeddedAt,
            vectorId: previousChunk.vectorId
          });
        }
      }
    }

    const manifests: IndexManifests = {
      documents: documents.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile)),
      chunks: chunks.sort((a, b) =>
        a.documentId === b.documentId
          ? a.chunkIndex - b.chunkIndex || a.chunkId.localeCompare(b.chunkId)
          : a.documentId.localeCompare(b.documentId)
      )
    };

    return {
      manifests,
      summary: this.summarize(manifests)
    };
  }

  private summarize(manifests: IndexManifests): IndexSummary {
    return {
      totalDocuments: manifests.documents.length,
      totalChunks: manifests.chunks.length,
      pendingEmbeddings: manifests.chunks.filter((chunk) => chunk.embeddingStatus === "pending")
        .length,
      changedDocuments: manifests.documents.filter((document) => document.status === "changed")
        .length,
      deletedDocuments: manifests.documents.filter((document) => document.status === "deleted")
        .length
    };
  }
}
