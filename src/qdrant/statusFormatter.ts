import type { QdrantStatus } from "./types.js";

export const formatQdrantStatus = (status: QdrantStatus): string =>
  [
    `Collection: ${status.collection}`,
    `Vectors: ${status.vectors}`,
    `Pending uploads: ${status.pendingUploads}`,
    `Deleted vectors: ${status.deletedVectors}`
  ].join("\n");
