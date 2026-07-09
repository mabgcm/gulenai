import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export const jsonText = (value: unknown): string => JSON.stringify(value, null, 2);

export const toolJson = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: jsonText(value) }]
});

export const resourceJson = (uri: string, value: unknown): ReadResourceResult => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: jsonText(value)
    }
  ]
});
