import type { TokenCounter } from "../chunking/tokenCounter.js";
import type { SearchResult } from "../search/types.js";
import type { AssembledPrompt, PromptAssemblyOptions, PromptChunk } from "./types.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a careful research assistant. Use only the retrieved context to prepare an answer. If the context is insufficient, state that clearly.";

const DEFAULT_INSTRUCTIONS = [
  "Use only the retrieved context.",
  "Do not invent facts that are not supported by the context.",
  "Preserve nuance and uncertainty.",
  "Keep track of source metadata for every claim."
];

const headingLabel = (headingPath: readonly string[]): string =>
  headingPath.length === 0 ? "(none)" : headingPath.join(" -> ");

const normalizeMarkdown = (markdown: string): string => markdown.trim().replace(/\n{3,}/g, "\n\n");

const renderChunk = (chunk: PromptChunk): string =>
  [
    `## Context ${chunk.rank}`,
    "",
    `Title: ${chunk.metadata.title ?? "(unknown)"}`,
    `URL: ${chunk.metadata.url ?? "(unknown)"}`,
    `Heading: ${headingLabel(chunk.metadata.headingPath)}`,
    `Chunk ID: ${chunk.metadata.chunkId}`,
    `Chunk IDs: ${chunk.metadata.chunkIds.join(", ")}`,
    `Score: ${chunk.metadata.similarityScore.toFixed(4)}`,
    `Merged: ${chunk.metadata.merged ? "yes" : "no"}`,
    "",
    chunk.markdown
  ].join("\n");

const renderPromptMarkdown = (
  systemPrompt: string,
  userQuestion: string,
  chunks: readonly PromptChunk[],
  instructions: readonly string[]
): string =>
  [
    "# SYSTEM",
    "",
    systemPrompt,
    "",
    "# QUESTION",
    "",
    userQuestion,
    "",
    "# RETRIEVED CONTEXT",
    "",
    chunks.length === 0
      ? "No retrieved context was included."
      : chunks.map(renderChunk).join("\n\n"),
    "",
    "# INSTRUCTIONS",
    "",
    ...instructions.map((instruction) => `- ${instruction}`)
  ].join("\n");

export class PromptAssembler {
  public constructor(private readonly tokenCounter: TokenCounter) {}

  public assemble(
    userQuestion: string,
    retrievedChunks: readonly SearchResult[],
    options: PromptAssemblyOptions
  ): AssembledPrompt {
    const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
    const maxContextTokens = Math.max(0, options.maxContextTokens);
    const ordered = options.preserveInputOrder
      ? [...retrievedChunks]
      : [...retrievedChunks].sort(
          (left, right) =>
            right.similarityScore - left.similarityScore ||
            left.documentId.localeCompare(right.documentId) ||
            left.metadata.chunkIndex - right.metadata.chunkIndex ||
            left.chunkId.localeCompare(right.chunkId)
        );
    const chunks = ordered.map((result, index): PromptChunk => {
      const markdown = normalizeMarkdown(result.markdown);
      return {
        rank: index + 1,
        metadata: {
          title: result.title,
          url: result.url,
          headingPath: result.headingPath,
          chunkId: result.chunkId,
          chunkIds: result.metadata.chunkIds,
          documentId: result.documentId,
          similarityScore: result.similarityScore,
          sourceFile: result.metadata.sourceFile,
          language: result.metadata.language,
          tokenCount: result.metadata.tokenCount,
          chunkIndex: result.metadata.chunkIndex,
          totalChunks: result.metadata.totalChunks,
          merged: result.metadata.merged
        },
        markdown,
        estimatedTokens: this.tokenCounter.count(renderChunkForBudget(index + 1, result, markdown))
      };
    });

    const selected: PromptChunk[] = [];
    const trimmed = [];
    let contextTokens = 0;
    for (const chunk of chunks) {
      if (contextTokens + chunk.estimatedTokens <= maxContextTokens) {
        selected.push(chunk);
        contextTokens += chunk.estimatedTokens;
        continue;
      }

      trimmed.push({
        rank: chunk.rank,
        chunkId: chunk.metadata.chunkId,
        title: chunk.metadata.title,
        estimatedTokens: chunk.estimatedTokens,
        reason: `context token budget exceeded (${maxContextTokens})`
      });
    }

    const promptMarkdown = renderPromptMarkdown(
      systemPrompt,
      userQuestion.trim(),
      selected,
      instructions
    );
    return {
      systemPrompt,
      userQuestion: userQuestion.trim(),
      chunks: selected,
      estimatedTokens: this.tokenCounter.count(promptMarkdown),
      trimmedChunks: trimmed,
      promptMarkdown
    };
  }
}

const renderChunkForBudget = (rank: number, result: SearchResult, markdown: string): string =>
  renderChunk({
    rank,
    metadata: {
      title: result.title,
      url: result.url,
      headingPath: result.headingPath,
      chunkId: result.chunkId,
      chunkIds: result.metadata.chunkIds,
      documentId: result.documentId,
      similarityScore: result.similarityScore,
      sourceFile: result.metadata.sourceFile,
      language: result.metadata.language,
      tokenCount: result.metadata.tokenCount,
      chunkIndex: result.metadata.chunkIndex,
      totalChunks: result.metadata.totalChunks,
      merged: result.metadata.merged
    },
    markdown,
    estimatedTokens: 0
  });
