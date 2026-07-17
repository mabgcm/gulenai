import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AliasConfiguration {
  readonly canonical: string;
  readonly aliases: readonly string[];
}

export interface HybridRankingConfiguration {
  readonly vectorWeight: number;
  readonly titleWeight: number;
  readonly metadataWeight: number;
  readonly aliasWeight: number;
  readonly entityWeight: number;
}

export interface RetrievalConfiguration {
  readonly languages: readonly string[];
  readonly maxExpandedQueries: number;
  readonly aliases: readonly AliasConfiguration[];
  readonly ranking: HybridRankingConfiguration;
  readonly candidateSelection: {
    readonly structuredReferenceFloor: number;
    readonly structuredReferenceTolerance: number;
  };
  readonly metadataFields: readonly string[];
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfiguration = {
  languages: ["tr", "en"],
  maxExpandedQueries: 8,
  aliases: [],
  ranking: {
    vectorWeight: 1,
    titleWeight: 0.25,
    metadataWeight: 0.15,
    aliasWeight: 0.1,
    entityWeight: 0.1
  },
  candidateSelection: {
    structuredReferenceFloor: 0.55,
    structuredReferenceTolerance: 0.05
  },
  metadataFields: [
    "title",
    "book",
    "section",
    "subsection",
    "chapter",
    "surah",
    "verse",
    "verseNumber",
    "hadithNumber",
    "author",
    "headingPath"
  ]
};

export const loadRetrievalConfig = (
  path = process.env.RETRIEVAL_CONFIG_PATH ?? resolve(process.cwd(), "config/retrieval.json")
): RetrievalConfiguration => {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RetrievalConfiguration>;
    return {
      ...DEFAULT_RETRIEVAL_CONFIG,
      ...parsed,
      ranking: { ...DEFAULT_RETRIEVAL_CONFIG.ranking, ...parsed.ranking },
      candidateSelection: {
        ...DEFAULT_RETRIEVAL_CONFIG.candidateSelection,
        ...parsed.candidateSelection
      }
    };
  } catch {
    return DEFAULT_RETRIEVAL_CONFIG;
  }
};
