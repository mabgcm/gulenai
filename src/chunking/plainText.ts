const stripMarkdownLinks = (value: string): string => value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
const stripMarkdownImages = (value: string): string =>
  value.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

export const markdownToPlainText = (markdown: string): string =>
  stripMarkdownLinks(stripMarkdownImages(markdown))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\|/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const countWords = (text: string): number => {
  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu);
  return words?.length ?? 0;
};
