import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/env.js";
import { runRisalePreflight } from "../../src/risale/preflight.js";

const config = () => ({
  ...loadConfig(),
  OPENAI_API_KEY: "test-openai-key",
  QDRANT_URL: "https://qdrant.example",
  QDRANT_API_KEY: "test-qdrant-key",
  QDRANT_COLLECTION: "fgulen",
  RISALE_QDRANT_COLLECTION: "risale"
});

describe("runRisalePreflight", () => {
  it("checks Qdrant access and reports collection availability", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ result: { collections: [{ name: "fgulen" }, { name: "risale" }] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const result = await runRisalePreflight(config(), request);

    expect(result).toEqual({
      qdrantCollections: ["fgulen", "risale"],
      risaleCollectionExists: true
    });
    expect(request).toHaveBeenCalledWith(
      "https://qdrant.example/collections",
      expect.objectContaining({ headers: { "api-key": "test-qdrant-key" } })
    );
  });

  it("fails clearly when the OpenAI key is missing", async () => {
    await expect(
      runRisalePreflight({ ...config(), OPENAI_API_KEY: undefined }, vi.fn<typeof fetch>())
    ).rejects.toThrow("Missing OPENAI_API_KEY");
  });

  it("rejects a shared FGülen and Risale collection", async () => {
    await expect(
      runRisalePreflight({ ...config(), RISALE_QDRANT_COLLECTION: "fgulen" }, vi.fn<typeof fetch>())
    ).rejects.toThrow("must differ");
  });

  it("reports Qdrant authorization failures", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    await expect(runRisalePreflight(config(), request)).rejects.toThrow("HTTP 401");
  });
});
