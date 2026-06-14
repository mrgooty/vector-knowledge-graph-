import { ingestDoc } from "@/lib/ingest";
import type { SourceChunk, SourceType } from "@/lib/types";

export interface Source {
  n: number;
  chunk_id: string;
  document_id: string;
  title: string;
  source_type: SourceType;
  similarity: number;
  score: number;
  snippet: string;
}

/** Assembler agent: turn retrieved chunks into the numbered, scored source list. */
export function assembleSources(chunks: SourceChunk[]): Source[] {
  return chunks.map((c, i) => ({
    n: i + 1,
    chunk_id: c.chunk_id,
    document_id: c.document_id,
    title: c.title,
    source_type: c.source_type,
    similarity: c.similarity,
    score: c.score,
    snippet: c.content.slice(0, 300),
  }));
}

/** Persist the Q&A as a browsable chat thread (no chunks → not retrievable). */
export async function persistConversation(
  query: string,
  answer: string,
): Promise<void> {
  await ingestDoc({
    provider: "manual",
    externalId: `qa:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceType: "chat",
    title: query.slice(0, 200),
    metadata: { kind: "copilot_conversation" },
    chunks: [],
    messages: [
      { role: "user", body: query },
      { role: "agent", body: answer },
    ],
  });
}
