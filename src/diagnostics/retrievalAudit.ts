import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { TokenCounter } from "../chunking/tokenCounter.js";
import type { AssembledPrompt } from "../prompt/types.js";
import type { SearchResult } from "../search/types.js";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";
import type { ChatCompletionRequest } from "../answer/types.js";

export interface RetrievalAuditInput {
  readonly question: string;
  readonly embeddingModel: string;
  readonly topKRequested: number;
  readonly retrievedChunks: readonly SearchResult[];
  readonly assembledPrompt: AssembledPrompt;
  readonly finalPrompt: ChatCompletionRequest | null;
}

interface RetrievalAuditRow {
  readonly rank: number;
  readonly similarityScore: number;
  readonly title: string | null;
  readonly headingPath: readonly string[];
  readonly sourceFile: string;
  readonly chunkIndex: number;
  readonly tokenCount: number;
}

const headingKey = (chunk: SearchResult): string => chunk.headingPath.join(" > ");
const bookKey = (chunk: SearchResult): string | null => chunk.headingPath[0] ?? null;
const percentage = (part: number, total: number): number =>
  total === 0 ? 0 : Number(((part / total) * 100).toFixed(2));

const markdownTable = (rows: readonly RetrievalAuditRow[]): string => {
  const header =
    "| Rank | Similarity | Title | Heading path | Source file | Chunk index | Tokens |\n" +
    "| ---: | ---: | --- | --- | --- | ---: | ---: |";
  const body = rows.map(
    (row) =>
      `| ${row.rank} | ${row.similarityScore.toFixed(6)} | ${row.title ?? "(unknown)"} | ${row.headingPath.join(" > ") || "(none)"} | ${row.sourceFile} | ${row.chunkIndex} | ${row.tokenCount} |`
  );
  return [header, ...body].join("\n");
};

export class RetrievalAuditReporter {
  public constructor(
    private readonly tokenCounter: TokenCounter,
    private readonly outputDirectory = join(process.cwd(), "reports", "retrieval-audit")
  ) {}

  public async write(input: RetrievalAuditInput): Promise<void> {
    try {
      const rows = input.retrievedChunks.map((chunk, index): RetrievalAuditRow => ({
        rank: index + 1,
        similarityScore: chunk.similarityScore,
        title: chunk.title,
        headingPath: chunk.headingPath,
        sourceFile: chunk.metadata.sourceFile,
        chunkIndex: chunk.metadata.chunkIndex,
        tokenCount: chunk.metadata.tokenCount
      }));
      const documents = new Set(input.retrievedChunks.map((chunk) => chunk.documentId));
      const books = new Set(
        input.retrievedChunks.map(bookKey).filter((book): book is string => book !== null)
      );
      const headings = new Set(input.retrievedChunks.map(headingKey));
      const averageSimilarity =
        rows.length === 0
          ? 0
          : rows.reduce((sum, row) => sum + row.similarityScore, 0) / rows.length;
      const promptTokens =
        input.finalPrompt?.messages.reduce(
          (sum, message) => sum + this.tokenCounter.count(message.content),
          0
        ) ?? 0;
      const report = {
        generatedAt: new Date().toISOString(),
        userQuestion: input.question,
        embeddingModel: input.embeddingModel,
        topKRequested: input.topKRequested,
        topKReturned: rows.length,
        retrievedChunkCount: rows.length,
        uniqueDocumentCount: documents.size,
        uniqueBookCount: books.size,
        uniqueHeadingPathCount: headings.size,
        totalContextTokens: input.assembledPrompt.chunks.reduce(
          (sum, chunk) => sum + chunk.metadata.tokenCount,
          0
        ),
        totalPromptTokens: promptTokens,
        retrievalTable: rows,
        contextDiversity: {
          booksRepresented: books.size,
          headingGroups: headings.size,
          averageSimilarity: Number(averageSimilarity.toFixed(6)),
          duplicatePercentage: percentage(rows.length - documents.size, rows.length)
        },
        finalPrompt: input.finalPrompt
      };
      const id = `${report.generatedAt.replace(/[:.]/g, "-")}-${randomUUID()}`;
      const markdown = [
        "# Retrieval Audit",
        "",
        `- Generated: ${report.generatedAt}`,
        `- User question: ${report.userQuestion}`,
        `- Embedding model: ${report.embeddingModel}`,
        `- topK requested: ${report.topKRequested}`,
        `- topK returned: ${report.topKReturned}`,
        `- Retrieved chunks: ${report.retrievedChunkCount}`,
        `- Unique documents: ${report.uniqueDocumentCount}`,
        `- Unique books: ${report.uniqueBookCount}`,
        `- Unique heading paths: ${report.uniqueHeadingPathCount}`,
        `- Total context tokens: ${report.totalContextTokens}`,
        `- Total prompt tokens: ${report.totalPromptTokens}`,
        "",
        "## Ordered retrieval",
        "",
        markdownTable(rows),
        "",
        "## Context diversity",
        "",
        `- Books represented: ${report.contextDiversity.booksRepresented}`,
        `- Heading groups: ${report.contextDiversity.headingGroups}`,
        `- Average similarity: ${report.contextDiversity.averageSimilarity}`,
        `- Duplicate percentage: ${report.contextDiversity.duplicatePercentage}%`,
        "",
        "## Final prompt",
        "",
        "```json",
        JSON.stringify(report.finalPrompt, null, 2),
        "```",
        ""
      ].join("\n");
      await ensureDir(this.outputDirectory);
      await Promise.all([
        writeJson(join(this.outputDirectory, `${id}.json`), report),
        writeTextFile(join(this.outputDirectory, `${id}.md`), markdown)
      ]);
    } catch {
      // Auditing is observational: filesystem failures must never affect an answer request.
    }
  }
}
