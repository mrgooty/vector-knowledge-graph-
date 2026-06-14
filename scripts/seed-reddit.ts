import "./_env";
import { fetchReddit } from "../lib/sources/reddit";
import { ingestMany } from "../lib/ingest";
import { chunkText } from "../lib/chunk";
import { scrubPII } from "../lib/sanitize";
import type { NormalizedDoc } from "../lib/types";

// Small de-identified fallback so the build never blocks without Reddit creds.
const FALLBACK: NormalizedDoc[] = [
  {
    provider: "reddit",
    externalId: "sample-1",
    sourceType: "chat",
    title: "Persistent fatigue despite normal bloodwork",
    authors: null,
    url: null,
    metadata: { subreddit: "AskDocs", sample: true },
    messages: [
      {
        role: "user",
        body: "I've had persistent fatigue for months. Bloodwork (CBC, thyroid, iron) came back normal. What else could be going on?",
      },
      {
        role: "assistant",
        body: "Normal common labs are reassuring. Consider sleep quality/apnea, vitamin D and B12, blood sugar regulation, and mental-health factors like depression. A sleep study and a discussion about stress and sleep hygiene are reasonable next steps.",
      },
    ],
    chunks: chunkText(
      "Persistent fatigue despite normal bloodwork. Possible causes: sleep apnea, vitamin D/B12 deficiency, blood sugar regulation, depression. Next steps: sleep study, sleep hygiene, mental-health screening.",
    ),
  },
];

async function main() {
  const topic = process.argv.slice(2).join(" ") || "chronic fatigue";
  const limit = Number(process.env.SEED_REDDIT_LIMIT || 25);

  console.log("Dataset: Reddit (live, official OAuth API) — health subreddits.");
  console.log(
    "Provenance: public posts, PII-scrubbed on ingest, author handles never stored, non-commercial use.",
  );

  let docs: NormalizedDoc[] = [];
  try {
    docs = await fetchReddit(topic, limit);
  } catch (err) {
    console.warn(`  Reddit API failed (${err instanceof Error ? err.message : err}).`);
  }

  if (docs.length === 0) {
    console.warn("  Falling back to bundled de-identified sample.");
    docs = FALLBACK.map((d) => ({
      ...d,
      messages: d.messages?.map((m) => ({ ...m, body: scrubPII(m.body) })),
    }));
  }

  const summary = await ingestMany(docs);
  console.log(
    `✓ Reddit: ${summary.createdDocs} new, ${summary.skippedDocs} cached, ${summary.newChunks} chunks embedded.`,
  );
}

main().catch((err) => {
  console.error("✗ seed-reddit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
