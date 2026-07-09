import type { SearchResult } from "./types.js";

const heading = (result: SearchResult): string =>
  result.headingPath.length === 0 ? "(none)" : result.headingPath.join(" -> ");

export const formatSearchResults = (results: readonly SearchResult[]): string => {
  if (results.length === 0) {
    return "Top Results\n\nNo results found.";
  }

  return [
    "Top Results",
    "",
    ...results.flatMap((result, index) => [
      `${index + 1}.`,
      `Score: ${result.similarityScore.toFixed(2)}`,
      `Book: ${result.title ?? "(unknown)"}`,
      "Heading:",
      heading(result),
      ""
    ])
  ]
    .join("\n")
    .trimEnd();
};
