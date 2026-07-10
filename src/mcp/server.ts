import { join } from "node:path";
import { readTextFile } from "../utils/fs.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config/env.js";
import { DefaultKnowledgeApiService } from "../api/services/knowledgeApiService.js";
import type { KnowledgeApiService } from "../api/types.js";
import { registerKnowledgePrompts } from "./prompts/registerPrompts.js";
import { registerKnowledgeResources } from "./resources/registerResources.js";
import { registerKnowledgeTools } from "./tools/registerTools.js";
import { MCP_SERVER_INFO } from "./types.js";

const readPackageVersion = async (): Promise<string> => {
  const content = await readTextFile(join(process.cwd(), "package.json"));
  const parsed = JSON.parse(content) as unknown;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }
  return "unknown";
};

export const createMcpServer = (service: KnowledgeApiService): McpServer => {
  const server = new McpServer(
    {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version
    },
    {
      instructions: MCP_SERVER_INFO.description
    }
  );
  const deps = { service };
  registerKnowledgeTools(server, deps);
  registerKnowledgeResources(server, deps);
  registerKnowledgePrompts(server, deps);
  return server;
};

export const createDefaultMcpServer = async (): Promise<McpServer> => {
  const config = loadConfig();
  return createMcpServer(new DefaultKnowledgeApiService(config, await readPackageVersion()));
};

export const runStdioMcpServer = async (): Promise<void> => {
  const server = await createDefaultMcpServer();
  await server.connect(new StdioServerTransport());
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runStdioMcpServer().catch((error: unknown) => {
    process.stderr.write(
      `MCP server failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
