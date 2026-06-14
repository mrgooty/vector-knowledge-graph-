import type { Provider } from "@/lib/types";

export interface SourcePlan {
  provider: Provider;
  limit: number;
}

// A fast, deterministic router (no LLM round-trip) that decides which source
// workers to deploy and how deep to go, based on the query's domain signals.
// Keeps latency flat while improving accuracy by weighting the right corpora.
const MED =
  /\b(health|disease|symptom|patient|clinical|medic\w*|drug|therap\w*|diagnos\w*|treatment|cancer|diet|fasting|sleep|cardio\w*|mental|depress\w*|anxiety|glp-?1|insulin|nutrition|vaccine|infection)\b/i;

const CS =
  /\b(algorithm|neural|transformer|llm|model|machine learning|deep learning|gpu|dataset|benchmark|quantum|compiler|cryptograph\w*|reinforcement|embedding)\b/i;

export function planSources(query: string): SourcePlan[] {
  const med = MED.test(query);
  const cs = CS.test(query);

  if (med && !cs) {
    return [
      { provider: "europepmc", limit: 8 },
      { provider: "reddit", limit: 6 },
      { provider: "openalex", limit: 5 },
      { provider: "arxiv", limit: 3 },
    ];
  }
  if (cs && !med) {
    return [
      { provider: "arxiv", limit: 8 },
      { provider: "openalex", limit: 6 },
      { provider: "europepmc", limit: 3 },
      { provider: "reddit", limit: 2 },
    ];
  }
  return [
    { provider: "europepmc", limit: 6 },
    { provider: "openalex", limit: 6 },
    { provider: "arxiv", limit: 5 },
    { provider: "reddit", limit: 5 },
  ];
}
