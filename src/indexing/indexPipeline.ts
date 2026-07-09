import type { Logger } from "../config/logger.js";
import type { ChunkIndexReader } from "./chunkIndexReader.js";
import { ManifestBuilder } from "./manifestBuilder.js";
import type { ManifestStore } from "./manifestStore.js";
import type { IndexSummary } from "./types.js";

export class IndexPipeline {
  public constructor(
    private readonly reader: ChunkIndexReader,
    private readonly store: ManifestStore,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async run(): Promise<IndexSummary> {
    const [chunks, previous] = await Promise.all([this.reader.readAll(), this.store.load()]);
    const builder = new ManifestBuilder();
    const { manifests, summary } = builder.build(chunks, previous, this.now().toISOString());
    await this.store.save(manifests, summary);
    this.logger.info(summary, "Document index updated");
    return summary;
  }
}
