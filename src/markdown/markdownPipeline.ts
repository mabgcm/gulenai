import type { Logger } from "../config/logger.js";
import type { CleanHtmlReader } from "./cleanHtmlReader.js";
import type { MarkdownConverter } from "./markdownConverter.js";
import type { MarkdownStore } from "./markdownStore.js";
import type { MarkdownDocument, MarkdownSummary } from "./types.js";

const metadataUrl = (metadata: Record<string, unknown> | null): string | null => {
  const value = metadata?.url;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

export class MarkdownPipeline {
  public constructor(
    private readonly reader: CleanHtmlReader,
    private readonly converter: MarkdownConverter,
    private readonly store: MarkdownStore,
    private readonly logger: Logger
  ) {}

  public async run(): Promise<MarkdownSummary> {
    const documents = await this.reader.readAll();
    let processed = 0;
    let failed = 0;

    for (const document of documents) {
      try {
        const markdownDocument: MarkdownDocument = {
          relativePath: document.relativePath,
          markdown: this.converter.convert(document.html, metadataUrl(document.metadata)),
          metadata: document.metadata,
          sourceHtmlPath: document.htmlPath
        };

        await this.store.save(markdownDocument);
        processed += 1;
        this.logger.info(
          {
            htmlPath: document.htmlPath,
            relativePath: document.relativePath,
            markdownLength: markdownDocument.markdown.length
          },
          "Converted clean HTML to Markdown"
        );
      } catch (error: unknown) {
        failed += 1;
        this.logger.error(
          { err: error, htmlPath: document.htmlPath },
          "Markdown conversion failed"
        );
      }
    }

    return { processed, failed };
  }
}
