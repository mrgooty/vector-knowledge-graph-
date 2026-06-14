import { query } from "@/lib/db";
import { embedOne, toVectorLiteral } from "@/lib/embeddings";
import type { SourceChunk } from "@/lib/types";

// The ONLY code path that touches the vector store. Both the MCP server and
// (for convenience) any direct caller go through these two functions.

export interface SearchArgs {
  query: string;
  source_types?: string[];
  k?: number;
}

export async function searchKnowledge(args: SearchArgs): Promise<SourceChunk[]> {
  const k = Math.min(Math.max(args.k ?? 6, 1), 20);
  const filter =
    args.source_types && args.source_types.length > 0
      ? args.source_types
      : null;

  const vec = await embedOne(args.query);

  return query<SourceChunk>(
    `SELECT chunk_id, document_id, source_type, title, content, similarity, score
       FROM search_chunks($1::vector, $2, $3, $4::text[])`,
    [toVectorLiteral(vec), args.query, k, filter],
  );
}

export interface DocumentDetail {
  id: string;
  source_type: string;
  provider: string;
  external_id: string | null;
  title: string;
  authors: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  messages: { id: string; role: string; body: string; position: number }[];
  chunks: { id: string; ordinal: number; content: string }[];
}

export async function getDocument(
  documentId: string,
): Promise<DocumentDetail | null> {
  const docs = await query<Omit<DocumentDetail, "messages" | "chunks">>(
    `SELECT id, source_type, provider, external_id, title, authors, url, metadata, created_at
       FROM documents WHERE id = $1`,
    [documentId],
  );
  if (docs.length === 0) return null;

  const messages = await query<DocumentDetail["messages"][number]>(
    `SELECT id, role, body, position FROM messages
      WHERE document_id = $1 ORDER BY position`,
    [documentId],
  );
  const chunks = await query<DocumentDetail["chunks"][number]>(
    `SELECT id, ordinal, content FROM chunks
      WHERE document_id = $1 ORDER BY ordinal`,
    [documentId],
  );

  return { ...docs[0], messages, chunks };
}
