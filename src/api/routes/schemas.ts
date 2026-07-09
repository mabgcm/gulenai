export const errorResponseSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      },
      required: ["code", "message"]
    }
  },
  required: ["error"]
} as const;

export const searchRequestJsonSchema = {
  type: "object",
  properties: {
    question: { type: "string", minLength: 1 },
    topK: { type: "integer", minimum: 1, maximum: 50 },
    threshold: { type: "number", minimum: 0, maximum: 1 },
    language: { type: "string" },
    documentId: { type: "string" },
    title: { type: "string" },
    url: { type: "string" },
    sourceFile: { type: "string" }
  },
  required: ["question"],
  additionalProperties: false
} as const;

export const citationSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
    headingPath: { type: "array", items: { type: "string" } },
    chunkId: { type: "string" },
    score: { type: "number" },
    chunkIndex: { type: "integer" },
    totalChunks: { type: "integer" }
  },
  required: ["id", "title", "url", "headingPath", "chunkId", "score", "chunkIndex", "totalChunks"]
} as const;

export const routeErrorResponses = {
  400: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema
} as const;
