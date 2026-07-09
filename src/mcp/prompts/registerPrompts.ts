import * as z from "zod/v4";
import type { McpRegistrar } from "../types.js";

const promptArgs = {
  question: z.string().min(1).describe("Question to use with the Knowledge Engine."),
  language: z.string().min(1).optional().describe("Optional language filter.")
};

export const registerKnowledgePrompts: McpRegistrar = (server) => {
  server.registerPrompt(
    "answer-question",
    {
      title: "Answer Question",
      description: "Use the FGulen AI answer tool to answer with strict source grounding.",
      argsSchema: promptArgs
    },
    ({ question, language }) => ({
      description: "Strict RAG answer prompt for FGulen AI.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use the MCP tool `answer` from FGulen AI.",
              "Answer only from indexed sources and include the returned confidence and citations.",
              "",
              `Question: ${question}`,
              language === undefined ? "" : `Language: ${language}`
            ]
              .filter((line) => line.length > 0)
              .join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "search-only",
    {
      title: "Search Only",
      description: "Use the FGulen AI search tool and do not generate an answer.",
      argsSchema: promptArgs
    },
    ({ question, language }) => ({
      description: "Search-only prompt for inspecting retrieved chunks.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use only the MCP tool `search` from FGulen AI.",
              "Return the retrieved chunks, scores, titles, URLs, and heading paths.",
              "Do not synthesize a final answer.",
              "",
              `Question: ${question}`,
              language === undefined ? "" : `Language: ${language}`
            ]
              .filter((line) => line.length > 0)
              .join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "citation-report",
    {
      title: "Citation Report",
      description: "Use FGulen AI sources to prepare a citation traceability report.",
      argsSchema: promptArgs
    },
    ({ question, language }) => ({
      description: "Citation reporting prompt for FGulen AI.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use the MCP tool `sources` from FGulen AI.",
              "Produce a concise citation report with document title, URL, heading path, chunk ID, score, chunk index, and total chunks.",
              "If no citations are returned, state that the indexed sources do not contain enough supporting information.",
              "",
              `Question: ${question}`,
              language === undefined ? "" : `Language: ${language}`
            ]
              .filter((line) => line.length > 0)
              .join("\n")
          }
        }
      ]
    })
  );
};
