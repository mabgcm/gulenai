import { resourceJson } from "../response.js";
import type { McpRegistrar } from "../types.js";

export const registerKnowledgeResources: McpRegistrar = (server, deps) => {
  server.registerResource(
    "knowledge-stats",
    "knowledge://stats",
    {
      title: "Knowledge Stats",
      description: "Current document, chunk, embedding, vector, language, and collection stats.",
      mimeType: "application/json"
    },
    async (uri) => resourceJson(uri.href, await deps.service.stats())
  );

  server.registerResource(
    "knowledge-version",
    "knowledge://version",
    {
      title: "Knowledge Engine Version",
      description: "Engine version, build date, git commit, and supported features.",
      mimeType: "application/json"
    },
    async (uri) => resourceJson(uri.href, await deps.service.version())
  );

  server.registerResource(
    "knowledge-languages",
    "knowledge://languages",
    {
      title: "Indexed Languages",
      description: "Languages currently present in the indexed dataset.",
      mimeType: "application/json"
    },
    async (uri) => {
      const stats = await deps.service.stats();
      return resourceJson(uri.href, { languages: stats.indexedLanguages });
    }
  );

  server.registerResource(
    "knowledge-collection",
    "knowledge://collection",
    {
      title: "Vector Collection",
      description: "Current Qdrant collection information.",
      mimeType: "application/json"
    },
    async (uri) => {
      const stats = await deps.service.stats();
      return resourceJson(uri.href, {
        collectionName: stats.collectionName,
        vectors: stats.vectors,
        chunks: stats.chunks
      });
    }
  );
};
