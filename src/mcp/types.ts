import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { KnowledgeApiService } from "../api/types.js";

export interface McpDependencies {
  readonly service: KnowledgeApiService;
}

export type McpRegistrar = (server: McpServer, deps: McpDependencies) => void;

export interface McpServerInfo {
  readonly name: "FGulen AI";
  readonly version: "1.0";
  readonly description: "Knowledge Engine powered by FGulen AI.";
}

export const MCP_SERVER_INFO: McpServerInfo = {
  name: "FGulen AI",
  version: "1.0",
  description: "Knowledge Engine powered by FGulen AI."
};
