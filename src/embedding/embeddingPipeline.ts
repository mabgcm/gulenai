import type { Logger } from "../config/logger.js";
import type { EmbeddingClient } from "./embeddingClient.js";
import type { ChunkPayloadReader } from "./chunkPayloadReader.js";
import type { EmbeddingIndexManifestStore } from "./indexManifestStore.js";
import type { EmbeddingVectorStore } from "./embeddingVectorStore.js";
import { formatEmbeddingProgress } from "./progress.js";
import type {
  EmbeddingChunkManifestEntry,
  EmbeddingConfig,
  EmbeddingResult,
  EmbeddingSummary,
  EmbeddingVectorFile,
  PendingEmbeddingChunk
} from "./types.js";

const batch = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const textForEmbedding = (chunk: PendingEmbeddingChunk): string =>
  [chunk.chunk.markdown, chunk.chunk.plainText].join("\n\n").trim();

const canResumeFromVector = (
  vector: EmbeddingVectorFile | null,
  chunk: PendingEmbeddingChunk,
  model: string
): vector is EmbeddingVectorFile =>
  vector !== null &&
  vector.chunkId === chunk.manifest.chunkId &&
  vector.contentHash === chunk.manifest.contentHash &&
  vector.model === model;

export class EmbeddingPipeline {
  public constructor(
    private readonly manifestStore: EmbeddingIndexManifestStore,
    private readonly payloadReader: ChunkPayloadReader,
    private readonly vectorStore: EmbeddingVectorStore,
    private readonly client: EmbeddingClient,
    private readonly config: EmbeddingConfig,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async run(): Promise<EmbeddingSummary> {
    const manifests = [...(await this.manifestStore.loadChunks())];
    const payloads = await this.payloadReader.readById();
    const pending = manifests
      .filter((chunk) => chunk.embeddingStatus === "pending")
      .map((manifest) => {
        const chunk = payloads.get(manifest.chunkId);
        return chunk === undefined ? null : { manifest, chunk };
      })
      .filter((item): item is PendingEmbeddingChunk => item !== null);

    let completed = 0;
    const skipped = manifests.filter((chunk) => chunk.embeddingStatus !== "pending").length;
    let failed = 0;
    const totalPending = pending.length;
    const manifestById = new Map(manifests.map((manifest) => [manifest.chunkId, manifest]));

    const report = (): void => {
      const progress = {
        pendingChunks: totalPending,
        completed,
        remaining: totalPending - completed
      };
      process.stdout.write(`${formatEmbeddingProgress(progress)}\n`);
    };

    report();

    const resumePending: PendingEmbeddingChunk[] = [];
    for (const chunk of pending) {
      if (!this.config.resume) {
        resumePending.push(chunk);
        continue;
      }

      const vector = await this.vectorStore.load(chunk.manifest.chunkId);
      if (canResumeFromVector(vector, chunk, this.config.model)) {
        this.applyVector(manifestById, chunk.manifest.chunkId, vector);
        completed += 1;
      } else {
        resumePending.push(chunk);
      }
    }

    if (this.config.resume) {
      await this.saveManifests(manifests, manifestById);
      report();
    }

    const batches = batch(resumePending, Math.max(1, this.config.batchSize));
    let nextBatch = 0;
    let saveQueue = Promise.resolve();

    const enqueueSave = async (): Promise<void> => {
      saveQueue = saveQueue.then(() => this.saveManifests(manifests, manifestById));
      await saveQueue;
    };

    const worker = async (): Promise<void> => {
      while (nextBatch < batches.length) {
        const current = batches[nextBatch];
        nextBatch += 1;
        if (current === undefined || current.length === 0) {
          continue;
        }

        try {
          const embeddings = await this.client.embed(current.map(textForEmbedding));
          if (embeddings.length !== current.length) {
            throw new Error("Embedding response count did not match request count");
          }

          for (let index = 0; index < current.length; index += 1) {
            const pendingChunk = current[index];
            const embedding = embeddings[index];
            if (pendingChunk === undefined || embedding === undefined) {
              continue;
            }

            const result: EmbeddingResult = {
              chunkId: pendingChunk.manifest.chunkId,
              contentHash: pendingChunk.manifest.contentHash,
              model: this.config.model,
              embedding,
              embeddedAt: this.now().toISOString()
            };
            const vector = await this.vectorStore.save(result);
            this.applyVector(manifestById, pendingChunk.manifest.chunkId, vector);
            completed += 1;
          }

          await enqueueSave();
          report();
        } catch (error: unknown) {
          failed += current.length;
          this.logger.error({ err: error, batchSize: current.length }, "Embedding batch failed");
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.max(1, this.config.concurrency) }, async () => worker())
    );
    await saveQueue;
    await this.saveManifests(manifests, manifestById);

    return {
      pendingChunks: totalPending,
      completed,
      remaining: totalPending - completed,
      skipped,
      failed
    };
  }

  private applyVector(
    manifestById: Map<string, EmbeddingChunkManifestEntry>,
    chunkId: string,
    vector: EmbeddingVectorFile
  ): void {
    const existing = manifestById.get(chunkId);
    if (existing === undefined) {
      return;
    }

    manifestById.set(chunkId, {
      ...existing,
      embeddingStatus: "embedded",
      embeddedAt: vector.embeddedAt,
      vectorId: null,
      embeddingModel: vector.model,
      embeddingDimensions: vector.dimensions
    });
  }

  private async saveManifests(
    manifests: readonly EmbeddingChunkManifestEntry[],
    manifestById: ReadonlyMap<string, EmbeddingChunkManifestEntry>
  ): Promise<void> {
    const updated = manifests.map((manifest) => manifestById.get(manifest.chunkId) ?? manifest);
    await this.manifestStore.saveChunks(updated);
  }
}
