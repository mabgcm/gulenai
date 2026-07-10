import { notFound } from "../middleware/errors.js";
import { parseSearchRequest } from "../middleware/validation.js";
import type { ApiSearchRequest, KnowledgeApiService } from "../types.js";
import { createSearchSnippet } from "../../search/searchSnippet.js";

const citationResponse = (citation: {
  readonly title: string | null;
  readonly url: string | null;
  readonly headingPath: readonly string[];
  readonly excerpt: string;
  readonly similarityScore: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
}) => ({
  title: citation.title,
  heading: citation.headingPath.at(-1) ?? citation.title,
  excerpt: citation.excerpt,
  url: citation.url,
  similarityScore: citation.similarityScore,
  chunkIndex: citation.chunkIndex,
  totalChunks: citation.totalChunks
});

export class KnowledgeController {
  public constructor(private readonly service: KnowledgeApiService) {}

  public async stats(): Promise<Awaited<ReturnType<KnowledgeApiService["stats"]>>> {
    return this.service.stats();
  }

  public async search(body: unknown): Promise<{ readonly results: unknown }> {
    const results = await this.service.search(this.request(body));
    return {
      results: results.map(({ markdown, ...result }) => ({
        ...result,
        snippet: createSearchSnippet(markdown)
      }))
    };
  }

  public async prompt(body: unknown): Promise<Awaited<ReturnType<KnowledgeApiService["prompt"]>>> {
    return this.service.prompt(this.request(body));
  }

  public async answer(body: unknown): Promise<{
    readonly answer: string;
    readonly confidence: number;
    readonly citations: readonly ReturnType<typeof citationResponse>[];
  }> {
    const answer = await this.service.answer(this.request(body));
    return {
      answer: answer.answer,
      confidence: answer.confidence,
      citations: answer.citations.map(citationResponse)
    };
  }

  public async sources(body: unknown): Promise<{
    readonly citations: readonly ReturnType<typeof citationResponse>[];
  }> {
    return {
      citations: (await this.service.sources(this.request(body))).map(citationResponse)
    };
  }

  public async document(documentId: string): Promise<unknown> {
    const document = await this.service.document(documentId);
    if (document === null) {
      throw notFound("Document");
    }
    return { metadata: document };
  }

  public async chunk(chunkId: string): Promise<unknown> {
    const chunk = await this.service.chunk(chunkId);
    if (chunk === null) {
      throw notFound("Chunk");
    }
    return chunk;
  }

  public async version(): Promise<Awaited<ReturnType<KnowledgeApiService["version"]>>> {
    return this.service.version();
  }

  private request(body: unknown): ApiSearchRequest {
    return parseSearchRequest(body);
  }
}
