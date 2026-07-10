import { describe, expect, it } from "vitest";
import { qdrantClientOptions } from "../../src/qdrant/clientConfig.js";

describe("qdrantClientOptions", () => {
  it("disables the optional compatibility probe", () => {
    expect(qdrantClientOptions("https://example.test", "secret")).toEqual({
      url: "https://example.test",
      apiKey: "secret",
      checkCompatibility: false
    });
  });

  it("omits blank API keys", () => {
    expect(qdrantClientOptions("http://localhost:6333", " ")).toEqual({
      url: "http://localhost:6333",
      checkCompatibility: false
    });
  });
});
