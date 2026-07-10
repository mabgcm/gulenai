const MAX_SNIPPET_LENGTH = 350;
const HEADING_LINE = /^\s{0,3}#{1,6}(?:\s+|$)/;

const firstMeaningfulParagraph = (markdown: string): string => {
  const blocks = markdown.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const paragraph = block
      .split("\n")
      .filter((line) => !HEADING_LINE.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (paragraph.length > 0) {
      return paragraph;
    }
  }
  return "";
};

export const createSearchSnippet = (markdown: string): string => {
  const paragraph = firstMeaningfulParagraph(markdown);
  if (paragraph.length <= MAX_SNIPPET_LENGTH) {
    return paragraph;
  }

  const contentLimit = MAX_SNIPPET_LENGTH - 3;
  const candidate = paragraph.slice(0, contentLimit);
  const sentenceEnds = [...candidate.matchAll(/[.!?](?=\s|$)/g)];
  const sentenceEnd = sentenceEnds.at(-1);
  if (sentenceEnd?.index !== undefined) {
    return `${candidate.slice(0, sentenceEnd.index + 1).trimEnd()}...`;
  }

  const wordBoundary = candidate.lastIndexOf(" ");
  const end = wordBoundary > 0 ? wordBoundary : contentLimit;
  return `${paragraph.slice(0, end).trimEnd()}...`;
};
