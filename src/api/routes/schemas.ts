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
    sources: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1 }
    },
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

export const answerRequestJsonSchema = {
  ...searchRequestJsonSchema,
  properties: {
    ...searchRequestJsonSchema.properties,
    sources: searchRequestJsonSchema.properties.sources
  }
} as const;

export const citationSchema = {
  type: "object",
  properties: {
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    source: { type: "string" },
    heading: { anyOf: [{ type: "string" }, { type: "null" }] },
    excerpt: { type: "string" },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
    similarityScore: { type: "number" },
    chunkIndex: { type: "integer" },
    totalChunks: { type: "integer" }
  },
  required: [
    "title",
    "source",
    "heading",
    "excerpt",
    "url",
    "similarityScore",
    "chunkIndex",
    "totalChunks"
  ]
} as const;

export const routeErrorResponses = {
  400: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema
} as const;
