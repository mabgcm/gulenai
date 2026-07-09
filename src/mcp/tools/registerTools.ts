import * as z from "zod/v4";
import type { ApiSearchRequest } from "../../api/types.js";
import { toolJson } from "../response.js";
import type { McpRegistrar } from "../types.js";

const questionSchema = {
  question: z.string().min(1).describe("User question to search or answer."),
  topK: z.number().int().positive().max(50).optional().describe("Maximum number of chunks."),
  language: z.string().min(1).optional().describe("Optional language filter, e.g. tr or en.")
};

const documentSchema = {
  documentId: z.string().min(1).describe("Document identifier from the index.")
};

const chunkSchema = {
  chunkId: z.string().min(1).describe("Chunk identifier from the index.")
};

const searchRequest = (request: {
  readonly question: string;
  readonly topK?: number | undefined;
  readonly language?: string | undefined;
}): ApiSearchRequest => ({
  question: request.question,
  ...(request.topK === undefined ? {} : { topK: request.topK }),
  ...(request.language === undefined ? {} : { language: request.language })
});

export const registerKnowledgeTools: McpRegistrar = (server, deps) => {
  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Search the indexed knowledge base and return retrieved chunks with scores.",
      inputSchema: questionSchema
    },
    async (request) => toolJson({ results: await deps.service.search(searchRequest(request)) })
  );

  server.registerTool(
    "answer",
    {
      title: "Answer",
      description: "Generate a strict RAG answer with confidence and citations.",
      inputSchema: questionSchema
    },
    async (request) => {
      const answer = await deps.service.answer(searchRequest(request));
      return toolJson({
        answer: answer.answer,
        confidence: answer.confidence,
        citations: answer.citations
      });
    }
  );

  server.registerTool(
    "sources",
    {
      title: "Sources",
      description: "Return citations only for a question.",
      inputSchema: {
        question: questionSchema.question,
        language: questionSchema.language
      }
    },
    async (request) => toolJson({ citations: await deps.service.sources(searchRequest(request)) })
  );

  server.registerTool(
    "document",
    {
      title: "Document",
      description: "Return document metadata by documentId.",
      inputSchema: documentSchema
    },
    async ({ documentId }) => {
      const document = await deps.service.document(documentId);
      return toolJson({ metadata: document });
    }
  );

  server.registerTool(
    "chunk",
    {
      title: "Chunk",
      description: "Return chunk metadata by chunkId.",
      inputSchema: chunkSchema
    },
    async ({ chunkId }) => toolJson(await deps.service.chunk(chunkId))
  );
};
