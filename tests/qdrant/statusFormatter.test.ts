import { describe, expect, it } from "vitest";
import { formatQdrantStatus } from "../../src/qdrant/statusFormatter.js";

describe("formatQdrantStatus", () => {
  it("formats qdrant status output", () => {
    expect(
      formatQdrantStatus({
        collection: "fgulen",
        vectors: 25342,
        pendingUploads: 14,
        deletedVectors: 3
      })
    ).toBe(
      ["Collection: fgulen", "Vectors: 25342", "Pending uploads: 14", "Deleted vectors: 3"].join(
        "\n"
      )
    );
  });
});
