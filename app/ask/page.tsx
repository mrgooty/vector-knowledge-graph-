"use client";

import { useState } from "react";
import Link from "next/link";
import { SourceTag } from "@/components/SourceTag";

interface Source {
  n: number;
  chunk_id: string;
  document_id: string;
  title: string;
  source_type: string;
  similarity: number;
  score: number;
  snippet: string;
}

interface WorkerInfo {
  provider: string;
  fetched: number;
  ms: number;
  error?: string;
}

type AgentEvent =
  | { type: "status"; stage: string; message: string }
  | { type: "cache"; hit: boolean; topSimilarity: number; count: number }
  | { type: "plan"; sources: { provider: string; limit: number }[] }
  | { type: "worker"; provider: string; fetched: number; ms: number; error?: string }
  | { type: "index"; createdDocs: number; skippedDocs: number; newChunks: number }
  | { type: "sources"; sources: Source[] }
  | { type: "token"; token: string }
  | { type: "done"; answer: string; usedCache: boolean }
  | { type: "error"; message: string };

const EXAMPLES = [
  "What does recent research say about intermittent fasting and metabolic health?",
  "How effective are GLP-1 drugs for weight loss, and what are the risks?",
  "What are common causes and treatments for chronic migraines?",
];

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState<{ provider: string; limit: number }[]>([]);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [cache, setCache] = useState<{ hit: boolean; topSimilarity: number; count: number } | null>(null);
  const [indexInfo, setIndexInfo] = useState<{ createdDocs: number; skippedDocs: number; newChunks: number } | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setStatus("Starting…");
    setPlan([]);
    setWorkers([]);
    setCache(null);
    setIndexInfo(null);
    setSources([]);
    setAnswer("");
    setError("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AgentEvent;
          switch (ev.type) {
            case "status":
              setStatus(ev.message);
              break;
            case "plan":
              setPlan(ev.sources);
              break;
            case "worker":
              setWorkers((w) => [...w, ev]);
              break;
            case "cache":
              setCache(ev);
              break;
            case "index":
              setIndexInfo(ev);
              break;
            case "sources":
              setSources(ev.sources);
              break;
            case "token":
              setAnswer((a) => a + ev.token);
              break;
            case "error":
              setError(ev.message);
              break;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  const showProgress = loading || workers.length > 0 || cache !== null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-stone-500 hover:text-stone-800">
          ← Knowledge Copilot
        </Link>
        <Link href="/browse" className="text-sm font-medium text-accent hover:underline">
          Browse the corpus →
        </Link>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight">Ask anything</h1>
      <p className="mt-1 text-stone-600">
        A team of specialized agents gathers, indexes, retrieves, and synthesizes
        — every answer grounded in cited sources.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(query);
        }}
        className="mt-6"
      >
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What does research say about GLP-1 drugs for weight loss?"
            className="flex-1 rounded-lg border border-stone-300 px-4 py-3 text-stone-900 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-accent px-5 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      {!loading && !answer && !error && (
        <div className="mt-6 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQuery(ex);
                ask(ex);
              }}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 transition hover:border-accent hover:text-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {showProgress && (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
            {loading && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />}
            {status || "Done"}
          </div>

          {cache && (
            <div className="mt-3 text-xs">
              {cache.hit ? (
                <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                  ⚡ Cache hit — answered from {cache.count} known passages (
                  {(cache.topSimilarity * 100).toFixed(0)}% top match); refreshing
                  in background
                </span>
              ) : (
                <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">
                  Cache miss — gathering fresh sources
                </span>
              )}
            </div>
          )}

          {plan.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {plan.map((p) => {
                const done = workers.find((w) => w.provider === p.provider);
                return (
                  <span
                    key={p.provider}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
                      !done
                        ? "bg-stone-100 text-stone-500"
                        : done.error
                          ? "bg-red-50 text-red-600"
                          : "bg-accent-soft text-accent"
                    }`}
                    title={done?.error}
                  >
                    {!done && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />}
                    {p.provider}
                    {done && !done.error && ` · ${done.fetched} in ${done.ms}ms`}
                    {done?.error && " · unavailable"}
                  </span>
                );
              })}
            </div>
          )}

          {indexInfo && (
            <div className="mt-3 text-xs">
              <span className="rounded-md bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
                Indexed +{indexInfo.newChunks} new chunks · {indexInfo.skippedDocs} already cached
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {answer && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Answer
          </h2>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
            {answer}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Sources · {sources.length}
          </h2>
          <ul className="mt-3 space-y-3">
            {sources.map((s) => {
              const open = expanded === s.chunk_id;
              return (
                <li
                  key={s.chunk_id}
                  className="rounded-xl border border-stone-200 bg-white p-4 transition hover:border-stone-300"
                >
                  <button
                    onClick={() => setExpanded(open ? null : s.chunk_id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {s.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <SourceTag type={s.source_type} />
                        <span className="text-xs font-medium text-stone-400">
                          {(s.similarity * 100).toFixed(1)}% match
                        </span>
                      </span>
                      <span className="mt-1 block truncate font-medium text-stone-800">
                        {s.title}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-600">
                      <p className="whitespace-pre-wrap">{s.snippet}…</p>
                      <Link
                        href={`/browse?doc=${s.document_id}`}
                        className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                      >
                        View source in Browse →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
