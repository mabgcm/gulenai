import { sha256 } from "../utils/hash.js";

export const vectorIdForChunk = (chunkId: string): string => {
  const hash = sha256(chunkId);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
      hash.slice(18, 20),
    hash.slice(20, 32)
  ].join("-");
};
