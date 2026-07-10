import { stripMarkdownFormatting } from "../search/searchSnippet.js";

const MIN_EXCERPT_LENGTH = 120;
const MAX_EXCERPT_LENGTH = 220;

const plainText = (markdown: string): string =>
  stripMarkdownFormatting(
    markdown
      .replace(/^\s{0,3}#{1,6}(?:\s+|$)/gm, "")
      .replace(/\r\n?/g, "\n")
  )
    .replace(/\s+/g, " ")
    .trim();

const centeredWordExcerpt = (text: string): string => {
  const ellipsisLength = 6;
  const contentLength = MAX_EXCERPT_LENGTH - ellipsisLength;
  const midpoint = Math.floor(text.length / 2);
  let start = Math.max(0, midpoint - Math.floor(contentLength / 2));
  let end = Math.min(text.length, start + contentLength);
  start = text.lastIndexOf(" ", start) + 1;
  const nextSpace = text.indexOf(" ", end);
  end = nextSpace > start ? nextSpace : end;
  const excerpt = text.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${excerpt}${end < text.length ? "..." : ""}`.slice(
    0,
    MAX_EXCERPT_LENGTH
  );
};

export const createCitationExcerpt = (markdown: string): string => {
  const text = plainText(markdown);
  if (text.length <= MAX_EXCERPT_LENGTH) {
    return text;
  }

  const sentences = text.split(/(?<=[.!?])\s+/);
  const midpoint = text.length / 2;
  let offset = 0;
  const positions = sentences.map((sentence) => {
    const start = offset;
    offset += sentence.length + 1;
    return { sentence, start, end: start + sentence.length };
  });
  const candidates: { readonly text: string; readonly distance: number }[] = [];
  for (let start = 0; start < positions.length; start += 1) {
    let excerpt = "";
    for (let end = start; end < positions.length; end += 1) {
      const sentence = positions[end]?.sentence ?? "";
      const next = excerpt.length === 0 ? sentence : `${excerpt} ${sentence}`;
      if (next.length > MAX_EXCERPT_LENGTH) {
        break;
      }
      excerpt = next;
      if (excerpt.length >= MIN_EXCERPT_LENGTH) {
        const rangeStart = positions[start]?.start ?? 0;
        const rangeEnd = positions[end]?.end ?? rangeStart;
        candidates.push({ text: excerpt, distance: Math.abs((rangeStart + rangeEnd) / 2 - midpoint) });
      }
    }
  }

  const best = candidates.sort((left, right) => left.distance - right.distance)[0];
  return best?.text ?? centeredWordExcerpt(text);
};
