import type { MarkdownBlock } from "./markdownBlocks.js";
import { parseMarkdownBlocks } from "./markdownBlocks.js";
import { countWords, markdownToPlainText } from "./plainText.js";
import type { TokenCounter } from "./tokenCounter.js";
import type {
  ChunkerConfig,
  ChunkMetadata,
  MarkdownChunk,
  MarkdownInputDocument
} from "./types.js";
import { sha256, shortHash } from "../utils/hash.js";

interface Section {
  readonly blocks: readonly MarkdownBlock[];
  readonly headingPath: readonly string[];
}

interface DraftChunk {
  readonly markdown: string;
  readonly plainText: string;
  readonly headingPath: readonly string[];
  readonly tokenCount: number;
  readonly wordCount: number;
  readonly contentHash: string;
}

const metadataString = (metadata: Record<string, unknown> | null, key: string): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const normalizeMarkdown = (blocks: readonly MarkdownBlock[]): string =>
  blocks
    .map((block) => block.markdown)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildHeadingPath = (blocks: readonly MarkdownBlock[]): readonly string[] => {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block !== undefined && block.headingPath.length > 0) {
      return block.headingPath;
    }
  }
  return [];
};

const groupSections = (blocks: readonly MarkdownBlock[]): readonly Section[] => {
  const sections: Section[] = [];
  let current: MarkdownBlock[] = [];

  const flush = (): void => {
    if (current.length === 0) {
      return;
    }
    sections.push({ blocks: current, headingPath: buildHeadingPath(current) });
    current = [];
  };

  for (const block of blocks) {
    if (block.type === "heading" && block.headingLevel !== null && block.headingLevel <= 2) {
      flush();
    }
    current.push(block);
  }

  flush();
  return sections;
};

const sliceWithOverlap = (
  chunks: readonly MarkdownBlock[],
  overlapTokens: number,
  counter: TokenCounter
): readonly MarkdownBlock[] => {
  if (overlapTokens <= 0 || chunks.length === 0) {
    return [];
  }

  const overlap: MarkdownBlock[] = [];
  let tokens = 0;
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const block = chunks[index];
    if (block === undefined || block.type === "heading") {
      continue;
    }

    const blockTokens = counter.count(block.markdown);
    if (tokens + blockTokens > overlapTokens && overlap.length > 0) {
      break;
    }

    overlap.unshift(block);
    tokens += blockTokens;
  }

  return overlap;
};

const ensureHeadingContext = (
  blocks: readonly MarkdownBlock[],
  headingContext: readonly MarkdownBlock[]
): readonly MarkdownBlock[] => {
  const firstNonOverlap = blocks.find(
    (block) => block.type !== "paragraph" || block.markdown.length > 0
  );
  if (firstNonOverlap?.type === "heading" || headingContext.length === 0) {
    return blocks;
  }

  const existingHeadingText = new Set(
    blocks.filter((block) => block.type === "heading").map((block) => block.headingText)
  );
  return [
    ...headingContext.filter((block) => !existingHeadingText.has(block.headingText)),
    ...blocks
  ];
};

export class MarkdownChunker {
  public constructor(
    private readonly config: ChunkerConfig,
    private readonly counter: TokenCounter
  ) {
    if (config.targetTokens <= 0) {
      throw new Error("targetTokens must be greater than zero");
    }
    if (config.maxTokens < config.targetTokens) {
      throw new Error("maxTokens must be greater than or equal to targetTokens");
    }
    if (config.overlapTokens < 0 || config.overlapTokens >= config.targetTokens) {
      throw new Error("overlapTokens must be non-negative and smaller than targetTokens");
    }
  }

  public chunk(document: MarkdownInputDocument): readonly MarkdownChunk[] {
    const blocks = parseMarkdownBlocks(document.markdown);
    const sections = groupSections(blocks);
    const draftBlocks = this.packSections(sections);
    const drafts = draftBlocks.map((chunkBlocks) => this.buildDraft(chunkBlocks));

    return drafts.map((draft, index) => ({
      metadata: this.buildMetadata(document, draft, index, drafts.length),
      markdown: draft.markdown,
      plainText: draft.plainText
    }));
  }

  private packSections(sections: readonly Section[]): readonly (readonly MarkdownBlock[])[] {
    const chunks: MarkdownBlock[][] = [];
    let current: MarkdownBlock[] = [];
    let currentTokens = 0;

    const emit = (): void => {
      if (current.length === 0) {
        return;
      }
      chunks.push(current);
      current = [...sliceWithOverlap(current, this.config.overlapTokens, this.counter)];
      currentTokens = this.counter.count(normalizeMarkdown(current));
    };

    for (const section of sections) {
      const sectionTokens = this.counter.count(normalizeMarkdown(section.blocks));
      if (sectionTokens > this.config.maxTokens) {
        if (current.length > 0) {
          emit();
        }
        for (const split of this.splitOversizedSection(section)) {
          chunks.push([...split]);
        }
        current = [];
        currentTokens = 0;
        continue;
      }

      if (currentTokens > 0 && currentTokens + sectionTokens > this.config.targetTokens) {
        emit();
      }

      current.push(...section.blocks);
      currentTokens = this.counter.count(normalizeMarkdown(current));
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  private splitOversizedSection(section: Section): readonly (readonly MarkdownBlock[])[] {
    const headingContext = section.blocks.filter((block) => block.type === "heading");
    const contentBlocks = section.blocks.filter((block) => block.type !== "heading");
    const chunks: MarkdownBlock[][] = [];
    let current: MarkdownBlock[] = [...headingContext];

    const emit = (): void => {
      const withContext = ensureHeadingContext(current, headingContext);
      if (withContext.length > 0) {
        chunks.push([...withContext]);
      }
      const overlap = sliceWithOverlap(current, this.config.overlapTokens, this.counter);
      current = [...headingContext, ...overlap];
    };

    for (const block of contentBlocks) {
      const next = [...current, block];
      const nextTokens = this.counter.count(normalizeMarkdown(next));
      if (current.length > headingContext.length && nextTokens > this.config.maxTokens) {
        emit();
      }
      current.push(block);
    }

    if (current.length > headingContext.length || chunks.length === 0) {
      chunks.push([...ensureHeadingContext(current, headingContext)]);
    }

    return chunks;
  }

  private buildDraft(blocks: readonly MarkdownBlock[]): DraftChunk {
    const markdown = normalizeMarkdown(blocks);
    const plainText = markdownToPlainText(markdown);
    return {
      markdown,
      plainText,
      headingPath: buildHeadingPath(blocks),
      tokenCount: this.counter.count(markdown),
      wordCount: countWords(plainText),
      contentHash: sha256(markdown)
    };
  }

  private buildMetadata(
    document: MarkdownInputDocument,
    draft: DraftChunk,
    chunkIndex: number,
    totalChunks: number
  ): ChunkMetadata {
    const seed = [
      document.relativePath,
      chunkIndex.toString(),
      draft.contentHash,
      draft.headingPath.join("/")
    ].join("|");

    return {
      id: shortHash(seed),
      sourceFile: document.relativePath,
      title: metadataString(document.metadata, "title"),
      url: metadataString(document.metadata, "url"),
      language: metadataString(document.metadata, "language"),
      headingPath: draft.headingPath,
      chunkIndex,
      totalChunks,
      tokenCount: draft.tokenCount,
      wordCount: draft.wordCount,
      contentHash: draft.contentHash
    };
  }
}
