import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import type { QdrantPoint } from "./types.js";

export interface QdrantVectorClient {
  collectionExists(collection: string): Promise<boolean>;
  createCollection(collection: string, dimensions: number): Promise<void>;
  count(collection: string): Promise<number>;
  upsert(collection: string, points: readonly QdrantPoint[]): Promise<void>;
  delete(collection: string, vectorIds: readonly string[]): Promise<void>;
}

const toPointStruct = (point: QdrantPoint): Schemas["PointStruct"] => ({
  id: point.id,
  vector: [...point.vector],
  payload: {
    chunkId: point.payload.chunkId,
    documentId: point.payload.documentId,
    url: point.payload.url,
    title: point.payload.title,
    language: point.payload.language,
    headingPath: [...point.payload.headingPath],
    chunkIndex: point.payload.chunkIndex,
    totalChunks: point.payload.totalChunks,
    tokenCount: point.payload.tokenCount,
    contentHash: point.payload.contentHash,
    sourceFile: point.payload.sourceFile
  }
});

export class RestQdrantVectorClient implements QdrantVectorClient {
  private readonly client: QdrantClient;

  public constructor(url: string, apiKey: string | undefined) {
    this.client = new QdrantClient(
      apiKey === undefined || apiKey.trim().length === 0 ? { url } : { url, apiKey }
    );
  }

  public async collectionExists(collection: string): Promise<boolean> {
    return (await this.client.collectionExists(collection)).exists;
  }

  public async createCollection(collection: string, dimensions: number): Promise<void> {
    await this.client.createCollection(collection, {
      vectors: {
        size: dimensions,
        distance: "Cosine"
      }
    });
  }

  public async count(collection: string): Promise<number> {
    if (!(await this.collectionExists(collection))) {
      return 0;
    }

    return (await this.client.count(collection, { exact: true })).count;
  }

  public async upsert(collection: string, points: readonly QdrantPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }

    await this.client.upsert(collection, {
      wait: true,
      points: points.map(toPointStruct)
    });
  }

  public async delete(collection: string, vectorIds: readonly string[]): Promise<void> {
    if (vectorIds.length === 0 || !(await this.collectionExists(collection))) {
      return;
    }

    await this.client.delete(collection, {
      wait: true,
      points: [...vectorIds]
    });
  }
}
