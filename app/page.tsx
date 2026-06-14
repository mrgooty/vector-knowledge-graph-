import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-24">
      <span className="text-sm font-medium uppercase tracking-widest text-accent">
        Knowledge Copilot
      </span>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
        Ask one question across papers, discussions, and reports.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-stone-600">
        A live research agent fetches relevant sources from the internet,
        indexes them in a vector store, and pieces together a cited answer —
        with every source shown and scored.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/ask"
          className="rounded-lg bg-accent px-5 py-3 font-medium text-white transition hover:opacity-90"
        >
          Ask a question
        </Link>
        <Link
          href="/browse"
          className="rounded-lg border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Browse the corpus
        </Link>
      </div>
    </main>
  );
}
