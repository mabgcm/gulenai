const TURKISH_QUERY_CORRECTIONS: Readonly<Record<string, string>> = {
  ihlass: "ihlas",
  riyaa: "riya"
};

export const normalizeSearchQuery = (query: string): string =>
  query
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const match = word.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u);
      if (match === null) return word;
      const [, prefix = "", token = "", suffix = ""] = match;
      return `${prefix}${TURKISH_QUERY_CORRECTIONS[token.toLocaleLowerCase("tr-TR")] ?? token}${suffix}`;
    })
    .join(" ");

export const normalizeForMatching = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
