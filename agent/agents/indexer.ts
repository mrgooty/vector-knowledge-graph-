import { indexDocs, type IndexSummary } from "@/lib/ingest";
import type { NormalizedDoc } from "@/lib/types";

/**
 * Indexer agent: dedup → batch-embed all new chunks → bulk upsert into the
 * pgvector store. This is the "put it all into one place" specialist.
 */
export async function indexerAgent(
  docs: NormalizedDoc[],
): Promise<IndexSummary> {
  return indexDocs(docs);
}

export type { IndexSummary };
