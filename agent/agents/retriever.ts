import { searchKnowledge } from "@/mcp/client";
import type { SourceChunk, SourceType } from "@/lib/types";

// Thresholds for the cache-first fast path: if the existing corpus already has
// enough strong matches, we can answer immediately and refresh in the
// background — the biggest responsiveness win for repeat/known topics.
const STRONG_MIN_RESULTS = 5;
const STRONG_MIN_SIMILARITY = 0.45;

export interface RetrieveResult {
  chunks: SourceChunk[];
  strong: boolean;
  topSimilarity: number;
}

/**
 * Retriever agent: hybrid (vector + lexical, RRF) search via the MCP tool.
 * Reports whether the result set is "strong" enough to short-circuit gather.
 */
export async function retrieverAgent(
  query: string,
  sourceTypes?: SourceType[],
  k = 8,
): Promise<RetrieveResult> {
  const chunks = await searchKnowledge({ query, source_types: sourceTypes, k });
  const topSimilarity = chunks.length
    ? Math.max(...chunks.map((c) => c.similarity))
    : 0;
  const strong =
    chunks.length >= STRONG_MIN_RESULTS &&
    topSimilarity >= STRONG_MIN_SIMILARITY;
  return { chunks, strong, topSimilarity };
}
