import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchKnowledge, getDocument } from "./tools";

// The MCP server: the governed boundary in front of the vector store. It
// exposes exactly two tools — minimalism reads as intentional.
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "knowledge-copilot",
    version: "0.1.0",
  });

  server.registerTool(
    "search_knowledge",
    {
      description:
        "Hybrid (vector + lexical, RRF-fused) semantic search over the chunk store. Returns the chunks that ARE the cited sources.",
      inputSchema: {
        query: z.string().describe("Natural-language search query"),
        source_types: z
          .array(z.enum(["paper", "chat", "report"]))
          .optional()
          .describe("Optional filter by source type"),
        k: z.number().int().min(1).max(20).optional().describe("Top-k (default 6)"),
      },
    },
    async ({ query, source_types, k }) => {
      const results = await searchKnowledge({ query, source_types, k });
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    },
  );

  server.registerTool(
    "get_document",
    {
      description:
        "Fetch a full document with its ordered messages and chunks (for 'view source').",
      inputSchema: { document_id: z.string().describe("Document UUID") },
    },
    async ({ document_id }) => {
      const doc = await getDocument(document_id);
      return { content: [{ type: "text", text: JSON.stringify(doc) }] };
    },
  );

  return server;
}
