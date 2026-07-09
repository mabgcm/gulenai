export type MetadataValue = string | number | boolean | null | readonly string[];

export interface ChunkMetadata {
  readonly [key: string]: MetadataValue;
}

export interface ChunkInput {
  readonly id: string;
  readonly markdown: string;
  readonly metadata: ChunkMetadata;
}

export interface Chunk {
  readonly id: string;
  readonly sourceId: string;
  readonly index: number;
  readonly text: string;
  readonly tokenCount: number;
  readonly metadata: ChunkMetadata;
}

export interface ChunkerConfig {
  readonly chunkSizeTokens: number;
  readonly overlapTokens: number;
}

const countTokens = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const splitMarkdownBlocks = (markdown: string): readonly string[] => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;

  const flush = (): void => {
    const block = current.join("\n").trim();
    if (block.length > 0) {
      blocks.push(block);
    }
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const startsFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");

    if (startsFence) {
      current.push(line);
      inCodeFence = !inCodeFence;
      if (!inCodeFence) {
        flush();
      }
      continue;
    }

    if (inCodeFence) {
      current.push(line);
      continue;
    }

    if (trimmed.length === 0) {
      flush();
      continue;
    }

    const startsStructuralBlock =
      /^#{1,6}\s/.test(trimmed) ||
      /^[-*+]\s/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed) ||
      trimmed.startsWith(">") ||
      trimmed.includes("|");

    const currentIsStructural =
      current.length > 0 &&
      (/^[-*+]\s/.test(current[0]?.trim() ?? "") ||
        /^\d+\.\s/.test(current[0]?.trim() ?? "") ||
        (current[0]?.trim().startsWith(">") ?? false) ||
        (current[0]?.trim().includes("|") ?? false));

    if (startsStructuralBlock && current.length > 0 && !currentIsStructural) {
      flush();
    }

    current.push(line);

    if (/^#{1,6}\s/.test(trimmed)) {
      flush();
    }
  }

  flush();
  return blocks;
};

const splitOversizedBlock = (block: string, maxTokens: number): readonly string[] => {
  if (countTokens(block) <= maxTokens) {
    return [block];
  }

  const words = block.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (let index = 0; index < words.length; index += maxTokens) {
    parts.push(words.slice(index, index + maxTokens).join(" "));
  }
  return parts;
};

export class MarkdownChunker {
  public constructor(private readonly config: ChunkerConfig) {
    if (config.chunkSizeTokens <= 0) {
      throw new Error("chunkSizeTokens must be greater than zero");
    }

    if (config.overlapTokens < 0 || config.overlapTokens >= config.chunkSizeTokens) {
      throw new Error("overlapTokens must be non-negative and smaller than chunkSizeTokens");
    }
  }

  public chunk(input: ChunkInput): readonly Chunk[] {
    const blocks = splitMarkdownBlocks(input.markdown).flatMap((block) =>
      splitOversizedBlock(block, this.config.chunkSizeTokens)
    );
    const chunks: Chunk[] = [];
    let currentBlocks: string[] = [];
    let currentTokens = 0;

    const emit = (): void => {
      if (currentBlocks.length === 0) {
        return;
      }

      const text = currentBlocks.join("\n\n").trim();
      chunks.push({
        id: `${input.id}:${chunks.length}`,
        sourceId: input.id,
        index: chunks.length,
        text,
        tokenCount: countTokens(text),
        metadata: {
          ...input.metadata,
          chunkIndex: chunks.length,
          sourceId: input.id
        }
      });

      const overlapBlocks: string[] = [];
      let overlapCount = 0;
      for (let index = currentBlocks.length - 1; index >= 0; index -= 1) {
        const block = currentBlocks[index];
        if (block === undefined) {
          continue;
        }

        const blockTokens = countTokens(block);
        if (overlapCount + blockTokens > this.config.overlapTokens && overlapBlocks.length > 0) {
          break;
        }

        overlapBlocks.unshift(block);
        overlapCount += blockTokens;
      }

      currentBlocks = overlapBlocks;
      currentTokens = overlapCount;
    };

    for (const block of blocks) {
      const blockTokens = countTokens(block);
      if (currentTokens > 0 && currentTokens + blockTokens > this.config.chunkSizeTokens) {
        emit();
      }

      currentBlocks.push(block);
      currentTokens += blockTokens;
    }

    emit();
    return chunks;
  }
}
