export interface RawDocument {
  readonly id: string;
  readonly rawPath: string;
  readonly relativePath: string;
  readonly html: string;
  readonly url: string | null;
  readonly crawlDate: string | null;
}

export interface ExtractedMetadata {
  readonly title: string | null;
  readonly url: string | null;
  readonly language: string | null;
  readonly author: string | null;
  readonly publishedDate: string | null;
  readonly crawlDate: string | null;
  readonly contentHash: string;
  readonly estimatedReadingTime: number;
  readonly wordCount: number;
}

export interface ExtractedDocument {
  readonly id: string;
  readonly relativePath: string;
  readonly cleanedHtml: string;
  readonly metadata: ExtractedMetadata;
  readonly extractionMethod: "semantic" | "readability";
}

export interface ExtractionSummary {
  readonly processed: number;
  readonly failed: number;
}

export interface RawIndexRecord {
  readonly id: string;
  readonly url: string;
  readonly finalUrl: string;
  readonly canonicalUrl: string | null;
  readonly status: number;
  readonly contentType: string;
  readonly title: string | null;
  readonly fetchedAt: string;
  readonly contentHash: string;
  readonly rawPath: string;
}
