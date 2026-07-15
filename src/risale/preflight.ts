import type { AppConfig } from "../config/env.js";

export interface RisalePreflightResult {
  readonly qdrantCollections: readonly string[];
  readonly risaleCollectionExists: boolean;
}

const required = (name: string, value: string | undefined): void => {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}. Add it to .env before running Risale ingestion.`);
  }
};

const qdrantCollections = (payload: unknown): readonly string[] => {
  if (typeof payload !== "object" || payload === null) return [];
  const result = (payload as { result?: unknown }).result;
  if (typeof result !== "object" || result === null) return [];
  const collections = (result as { collections?: unknown }).collections;
  if (!Array.isArray(collections)) return [];
  return collections.flatMap((item) =>
    typeof item === "object" &&
    item !== null &&
    typeof (item as { name?: unknown }).name === "string"
      ? [(item as { name: string }).name]
      : []
  );
};

export const runRisalePreflight = async (
  config: AppConfig,
  request: typeof fetch = fetch
): Promise<RisalePreflightResult> => {
  if (process.versions.node.split(".")[0] !== "22") {
    throw new Error(`Node.js 22.x is required; received ${process.version} (${process.execPath}).`);
  }
  required("OPENAI_API_KEY", config.OPENAI_API_KEY);
  required("QDRANT_URL", config.QDRANT_URL);
  if (config.RISALE_QDRANT_COLLECTION === config.QDRANT_COLLECTION) {
    throw new Error("RISALE_QDRANT_COLLECTION must differ from QDRANT_COLLECTION.");
  }

  const endpoint = `${config.QDRANT_URL.replace(/\/$/, "")}/collections`;
  let response: Response;
  try {
    response = await request(endpoint, {
      headers: config.QDRANT_API_KEY === undefined ? {} : { "api-key": config.QDRANT_API_KEY },
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    throw new Error(
      `Cannot connect to Qdrant at ${new URL(config.QDRANT_URL).origin}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Qdrant collection check failed with HTTP ${response.status}. Verify QDRANT_URL and QDRANT_API_KEY.`
    );
  }
  const collections = qdrantCollections(await response.json());
  return {
    qdrantCollections: collections,
    risaleCollectionExists: collections.includes(config.RISALE_QDRANT_COLLECTION)
  };
};
