import OpenAI from "openai";
import type { QueryEmbeddingClient } from "./types.js";
import { normalizeSearchQuery } from "./queryNormalizer.js";

export class OpenAiQueryEmbeddingClient implements QueryEmbeddingClient {
  private readonly openai: OpenAI;

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
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: normalizeSearchQuery(query)
    });
    const embedding = response.data[0]?.embedding;
    if (embedding === undefined) {
      throw new Error("OpenAI embedding response did not include an embedding");
    }
    return embedding;
  }
}
