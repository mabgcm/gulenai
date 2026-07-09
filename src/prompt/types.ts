export interface PromptChunkMetadata {
  readonly title: string | null;
  readonly url: string | null;
  readonly headingPath: readonly string[];
  readonly chunkId: string;
  readonly chunkIds: readonly string[];
  readonly documentId: string;
  readonly similarityScore: number;
  readonly sourceFile: string;
  readonly language: string | null;
  readonly tokenCount: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly merged: boolean;
}

export interface PromptChunk {
  readonly rank: number;
  readonly metadata: PromptChunkMetadata;
  readonly markdown: string;
  readonly estimatedTokens: number;
}

export interface TrimmedPromptChunk {
  readonly rank: number;
  readonly chunkId: string;
  readonly title: string | null;
  readonly estimatedTokens: number;
  readonly reason: string;
}

export interface AssembledPrompt {
  readonly systemPrompt: string;
  readonly userQuestion: string;
  readonly chunks: readonly PromptChunk[];
  readonly estimatedTokens: number;
  readonly trimmedChunks: readonly TrimmedPromptChunk[];
  readonly promptMarkdown: string;
}

export interface PromptAssemblyOptions {
  readonly maxContextTokens: number;
  readonly systemPrompt?: string;
  readonly instructions?: readonly string[];
}
