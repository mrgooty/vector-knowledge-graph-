import "./_env";
import { fetchEuropePmc } from "../lib/sources/europepmc";
import { fetchOpenAlex } from "../lib/sources/openalex";
import { fetchArxiv } from "../lib/sources/arxiv";
import { ingestMany } from "../lib/ingest";
import type { NormalizedDoc } from "../lib/types";

async function main() {
  const topic = process.argv.slice(2).join(" ") || "intermittent fasting metabolic health";
  const perSource = Number(process.env.SEED_PER_SOURCE || 10);
  console.log(`→ Seeding papers for: "${topic}" (${perSource} per source)`);

  const results = await Promise.allSettled([
    fetchEuropePmc(topic, perSource),
    fetchOpenAlex(topic, perSource),
    fetchArxiv(topic, perSource),
  ]);

  const docs: NormalizedDoc[] = [];
  const names = ["Europe PMC", "OpenAlex", "arXiv"];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      docs.push(...r.value);
      console.log(`  ${names[i]}: ${r.value.length} candidates`);
    } else {
      console.warn(`  ${names[i]}: failed — ${r.reason}`);
    }
  });

  const summary = await ingestMany(docs);
  console.log(
    `✓ Papers: ${summary.createdDocs} new, ${summary.skippedDocs} already cached, ${summary.newChunks} chunks embedded.`,
  );
}

main().catch((err) => {
  console.error("✗ seed-papers failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
