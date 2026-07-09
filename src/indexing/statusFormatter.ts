import type { IndexSummary } from "./types.js";

export const formatIndexStatus = (summary: IndexSummary): string =>
  [
    `Documents: ${summary.totalDocuments}`,
    `Chunks: ${summary.totalChunks}`,
    `Pending embeddings: ${summary.pendingEmbeddings}`,
    `Changed documents: ${summary.changedDocuments}`,
    `Deleted documents: ${summary.deletedDocuments}`
  ].join("\n");
