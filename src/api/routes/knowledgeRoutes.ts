import type { FastifyRequest } from "fastify";
import { KnowledgeController } from "../controllers/knowledgeController.js";
import type { ApiDependencies, RouteRegistrar } from "../types.js";
import { citationSchema, routeErrorResponses, searchRequestJsonSchema } from "./schemas.js";

interface IdParams {
  readonly documentId?: string;
  readonly chunkId?: string;
}

export const searchResultSchema = {
  type: "object",
  properties: {
    chunkId: { type: "string" },
    documentId: { type: "string" },
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
    headingPath: { type: "array", items: { type: "string" } },
    similarityScore: { type: "number" },
    snippet: { type: "string" },
    metadata: { type: "object", additionalProperties: true }
  },
  required: [
    "chunkId",
    "documentId",
    "title",
    "url",
    "headingPath",
    "similarityScore",
    "snippet",
    "metadata"
  ]
} as const;

export const knowledgeRoutes: RouteRegistrar = async (
  server,
  deps: ApiDependencies
): Promise<void> => {
  await Promise.resolve();
  const controller = new KnowledgeController(deps.service);

  server.get(
    "/stats",
    {
      schema: {
        tags: ["Knowledge"],
        response: {
          200: {
            type: "object",
            properties: {
              documents: { type: "integer" },
              chunks: { type: "integer" },
              vectors: { type: "integer" },
              embeddings: { type: "integer" },
              indexedLanguages: { type: "array", items: { type: "string" } },
              collectionName: { type: "string" }
            },
            required: [
              "documents",
              "chunks",
              "vectors",
              "embeddings",
              "indexedLanguages",
              "collectionName"
            ]
          },
          ...routeErrorResponses
        }
      }
    },
    async () => controller.stats()
  );

  server.post(
    "/search",
    {
      schema: {
        tags: ["Knowledge"],
        body: searchRequestJsonSchema,
        response: {
          200: {
            type: "object",
            properties: {
              results: { type: "array", items: searchResultSchema }
            },
            required: ["results"]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request) => controller.search(request.body)
  );

  server.post(
    "/prompt",
    {
      schema: {
        tags: ["Knowledge"],
        body: searchRequestJsonSchema,
        response: {
          200: {
            type: "object",
            properties: {
              systemPrompt: { type: "string" },
              userQuestion: { type: "string" },
              chunks: { type: "array", items: { type: "object", additionalProperties: true } },
              estimatedTokens: { type: "integer" },
              trimmedChunks: {
                type: "array",
                items: { type: "object", additionalProperties: true }
              },
              promptMarkdown: { type: "string" }
            },
            required: [
              "systemPrompt",
              "userQuestion",
              "chunks",
              "estimatedTokens",
              "trimmedChunks",
              "promptMarkdown"
            ]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request) => controller.prompt(request.body)
  );

  server.post(
    "/answer",
    {
      schema: {
        tags: ["Knowledge"],
        body: searchRequestJsonSchema,
        response: {
          200: {
            type: "object",
            properties: {
              answer: { type: "string" },
              confidence: { type: "integer" },
              citations: { type: "array", items: citationSchema }
            },
            required: ["answer", "confidence", "citations"]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request) => controller.answer(request.body)
  );

  server.post(
    "/sources",
    {
      schema: {
        tags: ["Knowledge"],
        body: searchRequestJsonSchema,
        response: {
          200: {
            type: "object",
            properties: {
              citations: { type: "array", items: citationSchema }
            },
            required: ["citations"]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request) => controller.sources(request.body)
  );

  server.get(
    "/document/:documentId",
    {
      schema: {
        tags: ["Knowledge"],
        params: {
          type: "object",
          properties: { documentId: { type: "string" } },
          required: ["documentId"]
        },
        response: {
          200: {
            type: "object",
            properties: { metadata: { type: "object", additionalProperties: true } },
            required: ["metadata"]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request: FastifyRequest<{ Params: IdParams }>) =>
      controller.document(request.params.documentId ?? "")
  );

  server.get(
    "/chunk/:chunkId",
    {
      schema: {
        tags: ["Knowledge"],
        params: {
          type: "object",
          properties: { chunkId: { type: "string" } },
          required: ["chunkId"]
        },
        response: {
          200: {
            type: "object",
            properties: { metadata: { type: "object", additionalProperties: true } },
            required: ["metadata"]
          },
          ...routeErrorResponses
        }
      }
    },
    async (request: FastifyRequest<{ Params: IdParams }>) =>
      controller.chunk(request.params.chunkId ?? "")
  );

  server.get(
    "/version",
    {
      schema: {
        tags: ["System"],
        response: {
          200: {
            type: "object",
            properties: {
              engineVersion: { type: "string" },
              buildDate: { type: "string" },
              gitCommit: { type: "string" },
              supportedFeatures: { type: "array", items: { type: "string" } }
            },
            required: ["engineVersion", "buildDate", "gitCommit", "supportedFeatures"]
          },
          ...routeErrorResponses
        }
      }
    },
    async () => controller.version()
  );
};
