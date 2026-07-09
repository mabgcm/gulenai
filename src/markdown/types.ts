export interface CleanHtmlDocument {
  readonly htmlPath: string;
  readonly metadataPath: string | null;
  readonly relativePath: string;
  readonly html: string;
  readonly metadata: Record<string, unknown> | null;
}

export interface MarkdownDocument {
  readonly relativePath: string;
  readonly markdown: string;
  readonly metadata: Record<string, unknown> | null;
  readonly sourceHtmlPath: string;
}

export interface MarkdownSummary {
  readonly processed: number;
  readonly failed: number;
}
