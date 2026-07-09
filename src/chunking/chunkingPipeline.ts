import type { Logger } from "../config/logger.js";
import type { ChunkStore } from "./chunkStore.js";
import type { MarkdownChunker } from "./chunker.js";
import type { MarkdownDocumentReader } from "./markdownDocumentReader.js";
import type { ChunkingSummary } from "./types.js";

export class ChunkingPipeline {
  public constructor(
    private readonly reader: MarkdownDocumentReader,
    private readonly chunker: MarkdownChunker,
    private readonly store: ChunkStore,
    private readonly logger: Logger
  ) {}

  public async run(): Promise<ChunkingSummary> {
    const documents = await this.reader.readAll();
    let processedDocuments = 0;
    let writtenChunks = 0;
    let failedDocuments = 0;

    for (const document of documents) {
      try {
        const chunks = this.chunker.chunk(document);
        await this.store.saveDocumentChunks(document, chunks);
        processedDocuments += 1;
        writtenChunks += chunks.length;
        this.logger.info(
          {
            markdownPath: document.markdownPath,
            relativePath: document.relativePath,
            chunks: chunks.length
          },
          "Chunked Markdown document"
        );
      } catch (error: unknown) {
        failedDocuments += 1;
        this.logger.error({ err: error, markdownPath: document.markdownPath }, "Chunking failed");
      }
    }

    return { processedDocuments, writtenChunks, failedDocuments };
  }
}
