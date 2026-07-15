export interface RisaleBook {
  readonly bookId: number;
  readonly name: string;
  readonly pageCount: number;
}

export interface RisalePageTarget {
  readonly bookId: number;
  readonly book: string;
  readonly pageNo: number;
  readonly canonicalUrl: string;
}

export interface RisaleRawPageMetadata extends RisalePageTarget {
  readonly knowledgeSource: "risale";
  readonly language: "tr";
  readonly fetchedAt: string;
  readonly rawPath: string;
  readonly contentHash: string;
}

export interface RisaleCrawlFailure extends RisalePageTarget {
  readonly error: string;
  readonly attempts: number;
  readonly failedAt: string;
}

export interface RisaleCrawlState {
  readonly books: readonly RisaleBook[];
  readonly completed: readonly string[];
  readonly failures: readonly RisaleCrawlFailure[];
  readonly updatedAt: string;
}

export interface RisaleCrawlSummary {
  readonly booksDiscovered: number;
  readonly pagesDiscovered: number;
  readonly pagesDownloaded: number;
  readonly downloadedThisRun: number;
  readonly skippedPages: number;
  readonly failedPages: number;
}

export interface RisaleParseSummary {
  readonly pagesParsed: number;
  readonly failedPages: number;
}

export interface RisaleValidationReport {
  readonly generatedAt: string;
  readonly knowledgeSource: "risale";
  readonly collection: string;
  readonly booksDiscovered: number;
  readonly pagesDownloaded: number;
  readonly pagesParsed: number;
  readonly chunksCreated: number;
  readonly embeddingsGenerated: number;
  readonly vectorsInserted: number;
  readonly skippedPages: number;
  readonly failedPages: number;
}
