import "./_env";
import { ingestMany } from "../lib/ingest";
import { chunkText } from "../lib/chunk";
import type { NormalizedDoc } from "../lib/types";

interface Report {
  id: string;
  title: string;
  sections: { heading: string; body: string }[];
}

const REPORTS: Report[] = [
  {
    id: "report-glp1-2025",
    title: "Internal Brief: GLP-1 Receptor Agonists — Efficacy & Safety Summary",
    sections: [
      {
        heading: "Overview",
        body: "GLP-1 receptor agonists (e.g., semaglutide, tirzepatide) are incretin mimetics approved for type 2 diabetes and, increasingly, chronic weight management. They slow gastric emptying, increase satiety, and improve glycemic control.",
      },
      {
        heading: "Efficacy",
        body: "Trials report mean weight reduction of 10–20% over 68 weeks depending on agent and dose, with substantial HbA1c improvements in diabetic populations. Effect sizes for dual GIP/GLP-1 agonists trend higher.",
      },
      {
        heading: "Safety & Risks",
        body: "Most common adverse events are gastrointestinal (nausea, vomiting, diarrhea), usually transient. Less common concerns include gallbladder events and pancreatitis. Weight regain is common after discontinuation, underscoring the chronic-treatment framing.",
      },
    ],
  },
  {
    id: "report-sleep-2025",
    title: "Internal Brief: Sleep & Metabolic Health",
    sections: [
      {
        heading: "Summary",
        body: "Short and fragmented sleep is associated with insulin resistance, increased appetite, and weight gain. Sleep is a modifiable lever often overlooked in metabolic interventions.",
      },
      {
        heading: "Mechanisms",
        body: "Sleep restriction alters leptin and ghrelin balance, raises cortisol, and reduces insulin sensitivity. Circadian misalignment (e.g., shift work) compounds these effects.",
      },
    ],
  },
  {
    id: "report-fasting-2025",
    title: "Internal Brief: Intermittent Fasting Protocols",
    sections: [
      {
        heading: "Protocols",
        body: "Common approaches include 16:8 time-restricted eating, 5:2 intermittent energy restriction, and alternate-day fasting. Adherence varies; time-restricted eating tends to have the best real-world adherence.",
      },
      {
        heading: "Evidence",
        body: "Most trials show weight loss comparable to continuous calorie restriction, with some signals for improved insulin sensitivity. Long-term outcome data remain limited.",
      },
    ],
  },
];

async function main() {
  const docs: NormalizedDoc[] = REPORTS.map((r) => ({
    provider: "report",
    externalId: r.id,
    sourceType: "report",
    title: r.title,
    authors: null,
    url: null,
    metadata: { synthetic: true },
    chunks: r.sections.flatMap((s) =>
      chunkText(`${s.heading}\n\n${s.body}`),
    ),
  }));

  const summary = await ingestMany(docs);
  console.log(
    `✓ Reports: ${summary.createdDocs} new, ${summary.skippedDocs} cached, ${summary.newChunks} chunks embedded.`,
  );
}

main().catch((err) => {
  console.error("✗ seed-reports failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
