export type PageClassification =
  | "article"
  | "category"
  | "tag"
  | "archive"
  | "table-of-contents"
  | "index"
  | "language-selector"
  | "image-gallery"
  | "author-listing"
  | "navigation"
  | "low-quality";

export type CrawlQualityStatus = "indexed" | "skipped" | "duplicate" | "replaced";

export interface CrawlQualityMetrics {
  readonly wordCount: number;
  readonly tokenCount: number;
  readonly textDensity: number;
  readonly headingDensity: number;
  readonly navigationRatio: number;
  readonly linkCount: number;
  readonly linkDensity: number;
  readonly duplicatePercentage: number;
  readonly boilerplateRatio: number;
}

export interface CrawlQualityAnalysis {
  readonly url: string;
  readonly title: string | null;
  readonly language: string | null;
  readonly classification: PageClassification;
  readonly qualityScore: number;
  readonly indexable: boolean;
  readonly reason: string;
  readonly normalizedTextHash: string;
  readonly simHash: string;
  readonly metrics: CrawlQualityMetrics;
}

export interface CrawlQualityDecision extends CrawlQualityAnalysis {
  readonly status: CrawlQualityStatus;
  readonly fetchedAt: string;
  readonly rawPath: string | null;
  readonly duplicateOf: string | null;
}

export interface SelectedDuplicateCandidate {
  readonly url: string;
  readonly rawId: string;
  readonly rawPath: string;
  readonly qualityScore: number;
  readonly normalizedTextHash: string;
  readonly simHash: string;
}

export interface CrawlQualityState {
  readonly decisions: readonly CrawlQualityDecision[];
  readonly selected: readonly SelectedDuplicateCandidate[];
  readonly updatedAt: string;
}

export interface CrawlQualitySummary {
  readonly totalPagesVisited: number;
  readonly indexedPages: number;
  readonly skippedPages: number;
  readonly duplicatePages: number;
  readonly categoryPages: number;
  readonly lowQualityPages: number;
  readonly averageQualityScore: number;
  readonly averageWordCount: number;
  readonly averageTokenCount: number;
  readonly languageDistribution: Record<string, number>;
  readonly lowestQualityPages: readonly CrawlQualityDecision[];
  readonly highestQualityPages: readonly CrawlQualityDecision[];
}
