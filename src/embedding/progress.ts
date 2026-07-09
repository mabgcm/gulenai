import type { EmbeddingProgress } from "./types.js";

export const formatEmbeddingProgress = (progress: EmbeddingProgress): string =>
  [
    `Pending chunks: ${progress.pendingChunks}`,
    `Completed: ${progress.completed}`,
    `Remaining: ${progress.remaining}`
  ].join("\n");
