import { StateGraph, START, END, Annotation, Send } from "@langchain/langgraph";
import type { NormalizedDoc, SourceChunk, SourceType } from "@/lib/types";
import { planSources, type SourcePlan } from "./agents/router";
import { runSourceWorker, type WorkerResult } from "./agents/sourceWorker";
import { indexerAgent } from "./agents/indexer";
import { retrieverAgent } from "./agents/retriever";
import { synthesize } from "./agents/synthesizer";
import { assembleSources, type Source } from "./agents/assembler";
import type { IndexSummary } from "@/lib/ingest";

// Canonical multi-agent graph (non-streaming sibling of the orchestrator).
// The "gather" phase is a true map-reduce fan-out: the supervisor dispatches a
// parallel Send to one sourceWorker per planned source, then all results merge
// before indexing.
const AgentState = Annotation.Root({
  query: Annotation<string>(),
  sourceTypes: Annotation<SourceType[] | undefined>(),
  plan: Annotation<SourcePlan[]>(),
  docs: Annotation<NormalizedDoc[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  workers: Annotation<WorkerResult[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  summary: Annotation<IndexSummary | undefined>(),
  chunks: Annotation<SourceChunk[]>(),
  answer: Annotation<string>(),
  sources: Annotation<Source[]>(),
});

interface WorkerPayload {
  provider: SourcePlan["provider"];
  query: string;
  limit: number;
}

const builder = new StateGraph(AgentState)
  .addNode("plan", (s) => ({ plan: planSources(s.query) }))
  .addNode("sourceWorker", async (payload: unknown) => {
    const p = payload as WorkerPayload;
    const w = await runSourceWorker(p.provider, p.query, p.limit);
    return { docs: w.docs, workers: [w] };
  })
  .addNode("index", async (s) => ({ summary: await indexerAgent(s.docs) }))
  .addNode("retrieve", async (s) => ({
    chunks: (await retrieverAgent(s.query, s.sourceTypes)).chunks,
  }))
  .addNode("synthesize", async (s) => ({
    answer: await synthesize(s.query, s.chunks),
  }))
  .addNode("assemble", (s) => ({ sources: assembleSources(s.chunks) }))
  .addEdge(START, "plan")
  .addConditionalEdges(
    "plan",
    (s) =>
      s.plan.map(
        (p) =>
          new Send("sourceWorker", {
            provider: p.provider,
            query: s.query,
            limit: p.limit,
          }),
      ),
    ["sourceWorker"],
  )
  .addEdge("sourceWorker", "index")
  .addEdge("index", "retrieve")
  .addEdge("retrieve", "synthesize")
  .addEdge("synthesize", "assemble")
  .addEdge("assemble", END);

const app = builder.compile();

export interface AgentResult {
  answer: string;
  sources: Source[];
  workers: WorkerResult[];
  summary?: IndexSummary;
}

/** Run the full multi-agent graph and return the cited answer. */
export async function run(
  query: string,
  sourceTypes?: SourceType[],
): Promise<AgentResult> {
  const final = await app.invoke({ query, sourceTypes });
  return {
    answer: final.answer,
    sources: final.sources,
    workers: final.workers,
    summary: final.summary,
  };
}
