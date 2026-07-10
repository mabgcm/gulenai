import { QdrantClient } from "@qdrant/js-client-rest";

type QdrantClientOptions = NonNullable<ConstructorParameters<typeof QdrantClient>[0]>;

export const qdrantClientOptions = (
  url: string,
  apiKey: string | undefined
): QdrantClientOptions => ({
  url,
  checkCompatibility: false,
  ...(apiKey === undefined || apiKey.trim().length === 0 ? {} : { apiKey })
});

export const verifyQdrantCollectionAccess = async (
  url: string,
  apiKey: string | undefined,
  collection: string
): Promise<void> => {
  const client = new QdrantClient(qdrantClientOptions(url, apiKey));
  await client.getCollection(collection);
};
