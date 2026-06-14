import { chat, chatStream, type ChatMessage } from "@/lib/llm";
import type { SourceChunk } from "@/lib/types";

const SYSTEM_PROMPT = `You are a careful research assistant. Answer the user's question USING ONLY the numbered sources provided.
- Cite sources inline by number in square brackets, e.g. [1], [2].
- Synthesize across sources; do not just copy. Be concise and precise.
- If the sources lack enough information, say so plainly. Never invent facts or citations.`;

export const NO_SOURCES_MESSAGE =
  "I couldn't find relevant sources for this question. Try rephrasing or broadening the topic.";

export function buildMessages(
  query: string,
  chunks: SourceChunk[],
): ChatMessage[] {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.source_type} — ${c.title})\n${c.content}`)
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Question: ${query}\n\nSources:\n${context}\n\nAnswer (cite sources by number):`,
    },
  ];
}

/** Synthesizer agent (streaming): yields answer tokens from the chunks only. */
export async function* synthesizeStream(
  query: string,
  chunks: SourceChunk[],
): AsyncGenerator<string> {
  if (chunks.length === 0) {
    yield NO_SOURCES_MESSAGE;
    return;
  }
  yield* chatStream(buildMessages(query, chunks));
}

/** Synthesizer agent (buffered) — used by the non-streaming LangGraph graph. */
export async function synthesize(
  query: string,
  chunks: SourceChunk[],
): Promise<string> {
  if (chunks.length === 0) return NO_SOURCES_MESSAGE;
  return chat(buildMessages(query, chunks));
}
