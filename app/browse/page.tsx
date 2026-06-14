"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SourceTag } from "@/components/SourceTag";

interface DocSummary {
  id: string;
  sourceType: string;
  provider: string;
  title: string;
  authors: string | null;
  url: string | null;
  createdAt: string;
  messageCount: number;
}

interface Message {
  id: string;
  role: string;
  body: string;
  position: number;
}

interface DocDetail extends DocSummary {
  metadata: Record<string, unknown> | null;
  messages: Message[];
}

const FILTERS = [
  { id: "", label: "All" },
  { id: "paper", label: "Papers" },
  { id: "chat", label: "Discussions" },
  { id: "report", label: "Reports" },
];

async function gql<T>(q: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "GraphQL error");
  return json.data as T;
}

export default function BrowsePage() {
  const [filter, setFilter] = useState("");
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  const loadDocs = useCallback(async (sourceType: string) => {
    setLoadingList(true);
    setError("");
    try {
      const data = await gql<{ documents: DocSummary[] }>(
        `query($sourceType: String) {
          documents(sourceType: $sourceType, limit: 100) {
            id sourceType provider title authors url createdAt messageCount
          }
        }`,
        { sourceType: sourceType || null },
      );
      setDocs(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openDoc = useCallback(async (id: string) => {
    try {
      const data = await gql<{ document: DocDetail }>(
        `query($id: ID!) {
          document(id: $id) {
            id sourceType provider title authors url metadata createdAt messageCount
            messages { id role body position }
          }
        }`,
        { id },
      );
      setSelected(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadDocs(filter);
  }, [filter, loadDocs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get("doc");
    if (doc) openDoc(doc);
  }, [openDoc]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-stone-500 hover:text-stone-800">
          ← Knowledge Copilot
        </Link>
        <Link href="/ask" className="text-sm font-medium text-accent hover:underline">
          Ask a question →
        </Link>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Left rail */}
        <aside className="col-span-12 sm:col-span-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Source type
          </h2>
          <nav className="mt-3 space-y-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  filter === f.id
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Document list */}
        <section className="col-span-12 sm:col-span-5">
          {loadingList && <p className="text-sm text-stone-400">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loadingList && docs.length === 0 && !error && (
            <p className="text-sm text-stone-400">
              No documents yet. Ask a question to populate the corpus.
            </p>
          )}
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => openDoc(d.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected?.id === d.id
                      ? "border-accent bg-accent-soft"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <SourceTag type={d.sourceType} />
                    <span className="text-xs text-stone-400">{d.provider}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-stone-800">
                    {d.title}
                  </p>
                  {d.authors && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
                      {d.authors}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Detail */}
        <section className="col-span-12 sm:col-span-4">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-400">
              Select a document to view it.
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <SourceTag type={selected.sourceType} />
                <span className="text-xs text-stone-400">{selected.provider}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-stone-900">
                {selected.title}
              </h3>
              {selected.authors && (
                <p className="mt-1 text-sm text-stone-500">{selected.authors}</p>
              )}
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                >
                  Open original ↗
                </a>
              )}

              {selected.messages.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                  {selected.messages.map((m) => (
                    <div key={m.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                        {m.role}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                        {m.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
