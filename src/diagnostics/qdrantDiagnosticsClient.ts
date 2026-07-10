import { QdrantClient } from "@qdrant/js-client-rest";
import { qdrantClientOptions } from "../qdrant/clientConfig.js";
import type { QdrantCollectionDiagnostics, RemoteVectorPoint } from "./types.js";

export interface QdrantDiagnosticsClient {
  inspectCollection(collection: string): Promise<QdrantCollectionDiagnostics>;
}

type ScrollOffset = string | number | Record<string, unknown> | null;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readVectorSize = (collectionInfo: unknown): number | null => {
  if (!isObject(collectionInfo)) {
    return null;
  }
  const config = collectionInfo.config;
  if (!isObject(config)) {
    return null;
  }
  const params = config.params;
  if (!isObject(params)) {
    return null;
  }
  const vectors = params.vectors;
  if (isObject(vectors) && typeof vectors.size === "number") {
    return vectors.size;
  }
  if (isObject(vectors)) {
    for (const value of Object.values(vectors)) {
      if (isObject(value) && typeof value.size === "number") {
        return value.size;
      }
    }
  }
  return null;
};

const payloadChunkId = (payload: unknown): string | null =>
  isObject(payload) && typeof payload.chunkId === "string" ? payload.chunkId : null;

export class RestQdrantDiagnosticsClient implements QdrantDiagnosticsClient {
  private readonly client: QdrantClient;

  public constructor(url: string, apiKey: string | undefined) {
    this.client = new QdrantClient(qdrantClientOptions(url, apiKey));
  }

  public async inspectCollection(collection: string): Promise<QdrantCollectionDiagnostics> {
    try {
      const exists = (await this.client.collectionExists(collection)).exists;
      if (!exists) {
        return {
          connected: true,
          collectionExists: false,
          vectorCount: 0,
          embeddingDimensions: null,
          remotePoints: [],
          error: null
        };
      }

      const [collectionInfo, count, remotePoints] = await Promise.all([
        this.client.getCollection(collection),
        this.client.count(collection, { exact: true }),
        this.scrollAll(collection)
      ]);

      return {
        connected: true,
        collectionExists: true,
        vectorCount: count.count,
        embeddingDimensions: readVectorSize(collectionInfo),
        remotePoints,
        error: null
      };
    } catch (error: unknown) {
      return {
        connected: false,
        collectionExists: false,
        vectorCount: 0,
        embeddingDimensions: null,
        remotePoints: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async scrollAll(collection: string): Promise<readonly RemoteVectorPoint[]> {
    const points: RemoteVectorPoint[] = [];
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
}
