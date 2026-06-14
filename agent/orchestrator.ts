import { asCompleted } from "@/lib/util/withTimeout";
import type { NormalizedDoc, SourceChunk, SourceType } from "@/lib/types";
import { planSources } from "./agents/router";
import { runSourceWorker } from "./agents/sourceWorker";
import { indexerAgent } from "./agents/indexer";
import { retrieverAgent } from "./agents/retriever";
import { synthesizeStream } from "./agents/synthesizer";
import { assembleSources, persistConversation, type Source } from "./agents/assembler";

export type AgentEvent =
  | { type: "status"; stage: string; message: string }
  | { type: "cache"; hit: boolean; topSimilarity: number; count: number }
  | { type: "plan"; sources: { provider: string; limit: number }[] }
  | { type: "worker"; provider: string; fetched: number; ms: number; error?: string }
  | { type: "index"; createdDocs: number; skippedDocs: number; newChunks: number }
  | { type: "sources"; sources: Source[] }
  | { type: "token"; token: string }
  | { type: "done"; answer: string; usedCache: boolean }
  | { type: "error"; message: string };

/**
 * Supervisor / orchestrator. Coordinates the specialized agents and streams
 * granular progress. Fast path: if the Retriever finds strong cached matches,
 * answer immediately and refresh the corpus in the background.
 */
export async function* orchestrate(
  query: string,
  sourceTypes?: SourceType[],
): AsyncGenerator<AgentEvent> {
  try {
    // ── Cache-first: ask the Retriever what we already know ───────────────
    yield { type: "status", stage: "retrieve", message: "Checking what we already know…" };
    const cached = await retrieverAgent(query, sourceTypes);
    yield {
      type: "cache",
      hit: cached.strong,
      topSimilarity: cached.topSimilarity,
      count: cached.chunks.length,
    };

    if (cached.strong) {
      // Warm the corpus for next time without blocking the answer.
      void backgroundRefresh(query);
      yield* answerFrom(query, cached.chunks, true);
      return;
    }

    // ── Gather: deploy source workers in parallel ─────────────────────────
    const plan = planSources(query);
    yield { type: "plan", sources: plan.map((p) => ({ provider: p.provider, limit: p.limit })) };
    yield { type: "status", stage: "gather", message: "Deploying source agents…" };

    const workerPromises = plan.map((p) =>
      runSourceWorker(p.provider, query, p.limit),
    );
    const docs: NormalizedDoc[] = [];
    for await (const w of asCompleted(workerPromises)) {
      docs.push(...w.docs);
      yield { type: "worker", provider: w.provider, fetched: w.fetched, ms: w.ms, error: w.error };
    }

    // ── Index: dedup, batch-embed, bulk upsert ────────────────────────────
    yield { type: "status", stage: "index", message: "Indexing new sources into the vector store…" };
    const summary = await indexerAgent(docs);
    yield { type: "index", ...summary };

    // ── Retrieve fresh, then synthesize + assemble ────────────────────────
    yield { type: "status", stage: "retrieve", message: "Ranking the most relevant passages…" };
    const fresh = await retrieverAgent(query, sourceTypes);
    yield* answerFrom(query, fresh.chunks, false);
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

async function* answerFrom(
  query: string,
  chunks: SourceChunk[],
  usedCache: boolean,
): AsyncGenerator<AgentEvent> {
  yield { type: "sources", sources: assembleSources(chunks) };
  yield { type: "status", stage: "synthesize", message: "Synthesizing a cited answer…" };

  let answer = "";
  for await (const token of synthesizeStream(query, chunks)) {
    answer += token;
    yield { type: "token", token };
  }

  await persistConversation(query, answer).catch(() => undefined);
  yield { type: "done", answer, usedCache };
}

async function backgroundRefresh(query: string): Promise<void> {
  try {
    const plan = planSources(query);
    const workers = await Promise.all(
      plan.map((p) => runSourceWorker(p.provider, query, p.limit)),
    );
    await indexerAgent(workers.flatMap((w) => w.docs));
  } catch {
    // best-effort warm; ignore failures
  }
}
