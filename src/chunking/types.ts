export interface MarkdownInputDocument {
  readonly markdownPath: string;
  readonly metadataPath: string | null;
  readonly relativePath: string;
  readonly markdown: string;
  readonly metadata: Record<string, unknown> | null;
}

export interface ChunkerConfig {
  readonly targetTokens: number;
  readonly maxTokens: number;
  readonly overlapTokens: number;
}

export interface ChunkMetadata {
  readonly id: string;
  readonly sourceFile: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly language: string | null;
  readonly headingPath: readonly string[];
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly tokenCount: number;
  readonly wordCount: number;
  readonly contentHash: string;
}

export interface MarkdownChunk {
  readonly metadata: ChunkMetadata;
  readonly markdown: string;
  readonly plainText: string;
}

export interface ChunkingSummary {
  readonly processedDocuments: number;
  readonly writtenChunks: number;
  readonly failedDocuments: number;
}
