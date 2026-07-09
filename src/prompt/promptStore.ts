import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir, writeJson } from "../utils/fs.js";
import type { AssembledPrompt } from "./types.js";

export interface PromptWriteResult {
  readonly markdownPath: string;
  readonly jsonPath: string;
}

export class PromptStore {
  public constructor(private readonly promptsDir = "data/prompts") {}

  public async write(prompt: AssembledPrompt): Promise<PromptWriteResult> {
    await ensureDir(this.promptsDir);
    const markdownPath = join(this.promptsDir, "prompt.md");
    const jsonPath = join(this.promptsDir, "prompt.json");
    await Promise.all([
      writeFile(markdownPath, `${prompt.promptMarkdown.trimEnd()}\n`, "utf8"),
      writeJson(jsonPath, {
        systemPrompt: prompt.systemPrompt,
        userQuestion: prompt.userQuestion,
        chunks: prompt.chunks,
        estimatedTokens: prompt.estimatedTokens,
        trimmedChunks: prompt.trimmedChunks
      })
    ]);
    return { markdownPath, jsonPath };
  }
}
