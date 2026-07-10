import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import { qdrantClientOptions } from "./clientConfig.js";
import type { QdrantPoint, QdrantRemotePoint } from "./types.js";

export interface QdrantVectorClient {
  collectionExists(collection: string): Promise<boolean>;
  createCollection(collection: string, dimensions: number): Promise<void>;
  count(collection: string): Promise<number>;
  listPoints(collection: string): Promise<readonly QdrantRemotePoint[]>;
  upsert(collection: string, points: readonly QdrantPoint[]): Promise<void>;
  delete(collection: string, vectorIds: readonly string[]): Promise<void>;
}

type ScrollOffset = string | number | Record<string, unknown> | null;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const payloadChunkId = (payload: unknown): string | null =>
  isObject(payload) && typeof payload.chunkId === "string" ? payload.chunkId : null;

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
    this.client = new QdrantClient(qdrantClientOptions(url, apiKey));
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

  public async listPoints(collection: string): Promise<readonly QdrantRemotePoint[]> {
    if (!(await this.collectionExists(collection))) {
      return [];
    }

    const points: QdrantRemotePoint[] = [];
    let offset: ScrollOffset | undefined = undefined;
    do {
      const request: Parameters<QdrantClient["scroll"]>[1] = {
        limit: 256,
        with_payload: true,
        with_vector: false
      };
      if (offset !== undefined) {
        Object.assign(request, { offset });
      }
      const response = await this.client.scroll(collection, request);
      for (const point of response.points) {
        points.push({
          id: String(point.id),
          chunkId: payloadChunkId(point.payload)
        });
      }
      offset = response.next_page_offset ?? undefined;
    } while (offset !== null && offset !== undefined);

    return points;
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
