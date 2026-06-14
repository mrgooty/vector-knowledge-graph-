import type { Provider } from "@/lib/types";

export interface SourcePlan {
  provider: Provider;
  limit: number;
}

// A fast, deterministic router (no LLM round-trip) that decides how deep each
// source worker should dig, based on the query's domain signals. Every source
// is universal (valid across all fields) so none is ever dropped — the router
// only *boosts* the corpora best suited to the detected domain, keeping latency
// flat while improving accuracy. OpenAlex (all-field scholarship) is the
// always-on backbone.

// Domain signals. These add depth to specialist sources; they never gate them.
const MED =
  /\b(health|disease|symptom|patient|clinical|medic\w*|drug|therap\w*|diagnos\w*|treatment|cancer|diet|fasting|sleep|cardio\w*|mental|depress\w*|anxiety|glp-?1|insulin|nutrition|vaccine|infection|biolog\w*|gene\w*|protein)\b/i;

const SCI =
  /\b(algorithm|neural|transformer|llm|machine learning|deep learning|quantum|physic\w*|chemistr\w*|astronom\w*|math\w*|theorem|cryptograph\w*|climate|materials|particle|cosmolog\w*|reinforcement|embedding|dataset|benchmark)\b/i;

// Programming / engineering signals — these favor Stack Overflow, which indexes
// practical, answer-accepted Q&A rather than research literature.
const CODE =
  /\b(code|coding|program\w*|function|class|api|library|framework|bug|error|exception|stack ?trace|compile|runtime|syntax|debug\w*|typescript|javascript|python|java|rust|golang|sql|regex|docker|kubernetes|npm|git|react|node)\b/i;

const clamp = (n: number) => Math.max(2, Math.min(10, n));

export function planSources(query: string): SourcePlan[] {
  const med = MED.test(query);
  const sci = SCI.test(query);
  const code = CODE.test(query);

  // Base depth: a balanced, field-agnostic spread. OpenAlex spans every
  // discipline, so it leads by default.
  const limits: Record<SourcePlan["provider"], number> = {
    openalex: 6,
    arxiv: 5,
    europepmc: 4,
    stackoverflow: 4,
    report: 0,
    manual: 0,
  };

  // Boost the specialists that fit the detected domain(s).
  if (med) {
    limits.europepmc += 4;
    limits.openalex += 1;
  }
  if (sci) {
    limits.arxiv += 3;
    limits.openalex += 2;
  }
  if (code) {
    limits.stackoverflow += 4;
  }
  // No strong technical signal? Lean a little more on the all-field corpus.
  if (!med && !sci && !code) {
    limits.openalex += 2;
  }

  return (
    ["openalex", "arxiv", "europepmc", "stackoverflow"] as const
  ).map((provider) => ({ provider, limit: clamp(limits[provider]) }));
}
