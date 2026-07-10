import pino from "pino";

const logger = pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

export const embeddingPreview = (embedding: readonly number[]): readonly number[] =>
  embedding.slice(0, 5).map((value) => Number(value.toFixed(6)));

export const logRetrievalDebug = (stage: string, details: Record<string, unknown>): void => {
  logger.info({ retrievalDebug: true, stage, ...details }, "Retrieval debug");
};
