import { sha256 } from "../utils/hash.js";

const TOKEN_PATTERN = /[\p{L}\p{N}]{3,}/gu;

export const tokenizeForSimilarity = (text: string): readonly string[] =>
  text.toLocaleLowerCase("tr").normalize("NFKC").match(TOKEN_PATTERN)?.slice(0, 8000) ?? [];

export const simHash = (tokens: readonly string[]): string => {
  const vector = Array.from({ length: 64 }, () => 0);
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  for (const [token, weight] of frequencies.entries()) {
    const digest = sha256(token);
    const bits = BigInt(`0x${digest.slice(0, 16)}`);
    for (let index = 0; index < 64; index += 1) {
      const mask = 1n << BigInt(index);
      vector[index] = (vector[index] ?? 0) + ((bits & mask) === 0n ? -weight : weight);
    }
  }

  let result = 0n;
  for (let index = 0; index < 64; index += 1) {
    if ((vector[index] ?? 0) >= 0) {
      result |= 1n << BigInt(index);
    }
  }

  return result.toString(16).padStart(16, "0");
};

export const hammingDistance = (left: string, right: string): number => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
};
