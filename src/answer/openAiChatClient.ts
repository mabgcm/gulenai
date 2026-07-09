import OpenAI from "openai";
import type { ChatCompletionClient, ChatCompletionRequest } from "./types.js";

export class OpenAiChatCompletionClient implements ChatCompletionClient {
  private readonly openai: OpenAI;

  public constructor(apiKey: string | undefined) {
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("OPENAI_API_KEY is required for answer generation");
    }
    this.openai = new OpenAI({ apiKey });
  }

  public async complete(request: ChatCompletionRequest): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    });
    const content = response.choices[0]?.message.content;
    if (content === null || content === undefined || content.trim().length === 0) {
      throw new Error("OpenAI chat completion response did not include content");
    }
    return content;
  }
}
