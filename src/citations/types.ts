import type { StrictRagAnswer } from "../answer/types.js";

export interface Citation {
  readonly id: number;
  readonly title: string | null;
  readonly url: string | null;
  readonly headingPath: readonly string[];
  readonly chunkId: string;
  readonly score: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
}

export interface CitationGroup {
  readonly id: number;
  readonly citations: readonly Citation[];
}

export interface CitedAnswer {
  readonly question: string;
  readonly answer: string;
  readonly confidence: number;
  readonly citations: readonly Citation[];
  readonly citationGroups: readonly CitationGroup[];
  readonly sourceAnswer: StrictRagAnswer;
}

export interface CitationChunkPreview {
  readonly chunkId: string;
  readonly preview: string;
}
