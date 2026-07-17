import { normalizeForMatching } from "./queryNormalizer.js";
import type { RetrievalConfiguration } from "./retrievalConfig.js";
import type {
  HybridScoreBreakdown,
  QueryPlan,
  RankedSearchHit,
  SearchHit
} from "./types.js";

const words = (value: string): readonly string[] =>
  normalizeForMatching(value).split(" ").filter((word) => word.length > 0);

const longestContiguousMatch = (
  queryWords: readonly string[],
  valueWords: readonly string[]
): number => {
  let longest = 0;
  for (let queryIndex = 0; queryIndex < queryWords.length; queryIndex += 1) {
    for (let valueIndex = 0; valueIndex < valueWords.length; valueIndex += 1) {
      let length = 0;
      while (
        queryWords[queryIndex + length] !== undefined &&
        queryWords[queryIndex + length] === valueWords[valueIndex + length]
      ) {
        length += 1;
      }
      longest = Math.max(longest, length);
    }
  }
  return longest;
};

const textScore = (queries: readonly string[], value: string): number => {
  const normalizedValue = normalizeForMatching(value);
  if (normalizedValue.length === 0) return 0;
  const valueWords = words(value);
  return Math.max(
    0,
    ...queries.map((query) => {
      const normalizedQuery = normalizeForMatching(query);
      if (normalizedValue === normalizedQuery) return 1;
      if (normalizedValue.includes(normalizedQuery)) {
        return 0.9;
      }
      const queryWords = words(query).filter((word) => word.length > 1);
      if (queryWords.length === 0) return 0;
      return longestContiguousMatch(queryWords, valueWords) / queryWords.length;
    })
  );
};

const stringValue = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(" ");
  return "";
};

export interface CandidateReranker {
  rerank(plan: QueryPlan, candidates: readonly RankedSearchHit[]): Promise<readonly RankedSearchHit[]>;
}

export class NoopCandidateReranker implements CandidateReranker {
  public async rerank(
    _plan: QueryPlan,
    candidates: readonly RankedSearchHit[]
  ): Promise<readonly RankedSearchHit[]> {
    await Promise.resolve();
    return candidates;
  }
}

export class HybridRanker {
  public constructor(private readonly config: RetrievalConfiguration) {}

  public rank(plan: QueryPlan, hit: SearchHit, matchedQuery: string): RankedSearchHit {
    const queries = plan.expandedQueries;
    const title = textScore(queries, hit.payload.title ?? "");
    const metadata = hit.payload.metadata ?? {};
    const metadataScores = this.config.metadataFields.filter((field) => field !== "title").map((field) => ({
      field,
      score: textScore(queries, field === "headingPath"
        ? hit.payload.headingPath.join(" ")
        : stringValue(metadata[field]))
    }));
    const metadataScore = Math.max(0, ...metadataScores.map(({ score }) => score));
    const matchedFields = metadataScores.filter(({ score }) => score > 0).map(({ field }) => field);
    if (title > 0) matchedFields.unshift("title");
    const searchableMetadata = [hit.payload.title ?? "", ...this.config.metadataFields.map((field) =>
      field === "headingPath" ? hit.payload.headingPath.join(" ") : stringValue(metadata[field])
    )].join(" ");
    const alias = plan.matchedAliases.length === 0
      ? 0
      : Math.max(...plan.matchedAliases.map(({ canonical }) => textScore([canonical], searchableMetadata)));
    const entity = plan.detectedEntities.length === 0
      ? 0
      : plan.detectedEntities.reduce((sum, { normalizedValue }) => sum +
          textScore([normalizedValue], searchableMetadata)
        , 0) / plan.detectedEntities.length;
    const weights = this.config.ranking;
    const unified =
      hit.score * weights.vectorWeight +
      title * weights.titleWeight +
      metadataScore * weights.metadataWeight +
      alias * weights.aliasWeight +
      entity * weights.entityWeight;
    const scoreBreakdown: HybridScoreBreakdown = {
      vector: hit.score,
      title,
      metadata: metadataScore,
      alias,
      entity,
      unified,
      matchedFields: [...new Set(matchedFields)]
    };
    return { ...hit, score: unified, rawVectorScore: hit.score, matchedQuery, scoreBreakdown };
  }
}
