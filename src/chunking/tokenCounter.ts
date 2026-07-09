import { getEncoding, type Tiktoken, type TiktokenEncoding } from "js-tiktoken";

export interface TokenCounter {
  count(text: string): number;
}

export class OpenAiTokenCounter implements TokenCounter {
  private readonly encoding: Tiktoken;

  public constructor(encodingName: TiktokenEncoding = "cl100k_base") {
    this.encoding = getEncoding(encodingName);
  }

  public count(text: string): number {
    if (text.trim().length === 0) {
      return 0;
    }

    return this.encoding.encode(text).length;
  }
}
