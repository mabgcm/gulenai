import type { Logger } from "../config/logger.js";
import type { ExtractedDocument, ExtractionSummary, RawDocument } from "./types.js";
import { buildMetadata } from "./metadata.js";
import type { ArticleExtractor } from "./articleExtractor.js";
import type { CleanDocumentStore } from "./cleanDocumentStore.js";
import type { RawDocumentReader } from "./rawDocumentReader.js";

export class ExtractionPipeline {
  public constructor(
    private readonly reader: RawDocumentReader,
    private readonly extractor: ArticleExtractor,
    private readonly store: CleanDocumentStore,
    private readonly logger: Logger
  ) {}

  public async run(): Promise<ExtractionSummary> {
    const rawDocuments = await this.reader.readAll();
    let processed = 0;
    let failed = 0;

    for (const raw of rawDocuments) {
      try {
        const extracted = this.extractOne(raw);
        await this.store.save(extracted);
        processed += 1;
        this.logger.info(
          {
            rawPath: raw.rawPath,
            relativePath: raw.relativePath,
            method: extracted.extractionMethod,
            wordCount: extracted.metadata.wordCount
          },
          "Extracted clean article HTML"
        );
      } catch (error: unknown) {
        failed += 1;
        this.logger.error({ err: error, rawPath: raw.rawPath }, "Content extraction failed");
      }
    }

    return { processed, failed };
  }

  private extractOne(raw: RawDocument): ExtractedDocument {
    const result = this.extractor.extract(raw.html, raw.url);
    return {
      id: raw.id,
      relativePath: raw.relativePath,
      cleanedHtml: result.cleanedHtml,
      metadata: buildMetadata(raw, raw.html, result.cleanedHtml),
      extractionMethod: result.method
    };
  }
}
