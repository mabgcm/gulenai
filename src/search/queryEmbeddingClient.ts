import OpenAI from "openai";
import type { QueryEmbeddingClient } from "./types.js";
import { normalizeSearchQuery } from "./queryNormalizer.js";

export class OpenAiQueryEmbeddingClient implements QueryEmbeddingClient {
  private readonly openai: OpenAI;
  private readonly cache = new Map<string, Promise<readonly number[]>>();

  public constructor(
    apiKey: string | undefined,
    private readonly model: string
  ) {
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("OPENAI_API_KEY is required for semantic search");
    }

    this.openai = new OpenAI({ apiKey });
  }

  public async embedQuery(query: string): Promise<readonly number[]> {
    return (await this.embedQueries([query]))[0] ?? [];
  }

  public async embedQueries(queries: readonly string[]): Promise<readonly (readonly number[])[]> {
    const normalized = queries.map(normalizeSearchQuery);
    const missing = normalized.filter((query) => !this.cache.has(query));
    if (missing.length > 0) {
      const uniqueMissing = [...new Set(missing)];
      const pending = this.openai.embeddings.create({ model: this.model, input: uniqueMissing });
      uniqueMissing.forEach((query, index) => {
        this.cache.set(
          query,
          pending.then((response) => {
            const embedding = response.data[index]?.embedding;
            if (embedding === undefined) {
              throw new Error("OpenAI embedding response did not include an embedding");
            }
            return embedding;
          })
        );
      });
    }
    return Promise.all(normalized.map((query) => this.cache.get(query)!));
  }
}
