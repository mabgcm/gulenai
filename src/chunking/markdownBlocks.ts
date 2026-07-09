export type MarkdownBlockType =
  "heading" | "paragraph" | "blockquote" | "list" | "table" | "code" | "horizontalRule";

export interface MarkdownBlock {
  readonly type: MarkdownBlockType;
  readonly markdown: string;
  readonly headingLevel: number | null;
  readonly headingText: string | null;
  readonly headingPath: readonly string[];
}

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*$/;
const unorderedListPattern = /^(\s*)[-*+]\s+/;
const orderedListPattern = /^(\s*)\d+[.)]\s+/;

const isHeading = (line: string): boolean => headingPattern.test(line.trim());
const isFence = (line: string): boolean => /^(```|~~~)/.test(line.trim());
const isHorizontalRule = (line: string): boolean => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
const isBlockquote = (line: string): boolean => /^ {0,3}>\s?/.test(line);
const isListItem = (line: string): boolean =>
  unorderedListPattern.test(line) || orderedListPattern.test(line);
const isTableLine = (line: string): boolean => line.includes("|");
const isTableSeparator = (line: string): boolean =>
  /^ {0,3}\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const trimBlock = (lines: readonly string[]): string => lines.join("\n").trim();

const classifyParagraphLikeBlock = (lines: readonly string[]): MarkdownBlockType => {
  const first = lines[0] ?? "";
  if (isBlockquote(first)) {
    return "blockquote";
  }
  if (isListItem(first)) {
    return "list";
  }
  if (
    lines.some(isTableSeparator) ||
    lines.every((line) => isTableLine(line) || line.trim() === "")
  ) {
    return "table";
  }
  return "paragraph";
};

export const parseMarkdownBlocks = (markdown: string): readonly MarkdownBlock[] => {
  const lines = markdown.replace(/\r\n?/g, "\n").normalize("NFC").split("\n");
  const blocks: MarkdownBlock[] = [];
  const headingStack: string[] = [];
  let index = 0;

  const pushBlock = (
    type: MarkdownBlockType,
    blockLines: readonly string[],
    headingLevel: number | null = null,
    headingText: string | null = null
  ): void => {
    const blockMarkdown = trimBlock(blockLines);
    if (blockMarkdown.length === 0) {
      return;
    }

    blocks.push({
      type,
      markdown: blockMarkdown,
      headingLevel,
      headingText,
      headingPath: [...headingStack]
    });
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const headingMatch = headingPattern.exec(line.trim());
    if (headingMatch !== null) {
      const level = headingMatch[1]?.length ?? 1;
      const text = headingMatch[2]?.trim() ?? "";
      headingStack.splice(level - 1);
      headingStack[level - 1] = text;
      pushBlock("heading", [line], level, text);
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const fence = line.trim().slice(0, 3);
      const blockLines = [line];
      index += 1;
      while (index < lines.length) {
        const current = lines[index] ?? "";
        blockLines.push(current);
        index += 1;
        if (current.trim().startsWith(fence)) {
          break;
        }
      }
      pushBlock("code", blockLines);
      continue;
    }

    if (isHorizontalRule(line)) {
      pushBlock("horizontalRule", [line]);
      index += 1;
      continue;
    }

    const blockLines = [line];
    index += 1;
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim().length === 0 ||
        isHeading(current) ||
        isFence(current) ||
        isHorizontalRule(current)
      ) {
        break;
      }
      blockLines.push(current);
      index += 1;
    }

    pushBlock(classifyParagraphLikeBlock(blockLines), blockLines);
  }

  return blocks;
};
