import OpenAI from "openai";
import type { Logger } from "../config/logger.js";
import { withExponentialBackoff } from "./retry.js";

export interface EmbeddingClient {
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export class OpenAiEmbeddingClient implements EmbeddingClient {
  private readonly openai: OpenAI;

  public constructor(
    apiKey: string | undefined,
    private readonly model: string,
    private readonly retries: number,
    private readonly logger: Logger
  ) {
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("OPENAI_API_KEY is required for embedding generation");
    }

    this.openai = new OpenAI({ apiKey });
  }

  public async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) {
      return [];
    }

    return withExponentialBackoff(
      async () => {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: [...texts]
        });

        return [...response.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      },
      this.retries,
      this.logger,
      { model: this.model, batchSize: texts.length }
    );
  }
}
