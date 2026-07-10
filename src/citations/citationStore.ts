import { join } from "node:path";
import { ensureDir, mapWithFilesystemConcurrency, writeJson, writeTextFile } from "../utils/fs.js";
import { formatCitedAnswerMarkdown } from "./citationFormatter.js";
import type { CitedAnswer } from "./types.js";

export interface CitationWriteResult {
  readonly markdownPath: string;
  readonly jsonPath: string;
}

export class CitationStore {
  public constructor(private readonly answersDir = "data/answers") {}

  public async write(answer: CitedAnswer): Promise<CitationWriteResult> {
    await ensureDir(this.answersDir);
    const markdownPath = join(this.answersDir, "answer.md");
    const jsonPath = join(this.answersDir, "answer.json");

    await mapWithFilesystemConcurrency(
      [
        async () => writeTextFile(markdownPath, `${formatCitedAnswerMarkdown(answer).trimEnd()}\n`),
        async () =>
          writeJson(jsonPath, {
            question: answer.question,
            answer: answer.answer,
            confidence: answer.confidence,
            citations: answer.citations.map((citation) => ({
              id: citation.id,
              title: citation.title,
              url: citation.url,
              headingPath: citation.headingPath,
              chunkId: citation.chunkId,
              score: citation.score,
              chunkIndex: citation.chunkIndex,
              totalChunks: citation.totalChunks
            }))
          })
      ],
      async (write) => write()
    );

    return { markdownPath, jsonPath };
  }
}
