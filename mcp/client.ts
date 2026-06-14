import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import type { SourceChunk } from "@/lib/types";
import type { DocumentDetail, SearchArgs } from "./tools";

// In-process MCP client. The Next.js server talks to the MCP server over a
// linked in-memory transport — no network, but a real MCP call boundary, so
// the "agent only touches the DB through MCP" invariant holds.

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const server = createMcpServer();
      await server.connect(serverTransport);
      const client = new Client({ name: "kc-agent", version: "0.1.0" });
      await client.connect(clientTransport);
      return client;
    })();
  }
  return clientPromise;
}

function parseToolResult<T>(result: unknown, fallback: T): T {
  const content = (result as { content?: { type: string; text?: string }[] })
    ?.content;
  const text = content?.find((c) => c.type === "text")?.text;
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function searchKnowledge(args: SearchArgs): Promise<SourceChunk[]> {
  const client = await getClient();
  const result = await client.callTool({
    name: "search_knowledge",
    arguments: { ...args },
  });
  return parseToolResult<SourceChunk[]>(result, []);
}

export async function getDocument(
  documentId: string,
): Promise<DocumentDetail | null> {
  const client = await getClient();
  const result = await client.callTool({
    name: "get_document",
    arguments: { document_id: documentId },
  });
  return parseToolResult<DocumentDetail | null>(result, null);
}
