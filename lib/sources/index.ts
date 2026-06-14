import type { NormalizedDoc, Provider } from "../types";
import { fetchEuropePmc } from "./europepmc";
import { fetchOpenAlex } from "./openalex";
import { fetchArxiv } from "./arxiv";
import { fetchReddit } from "./reddit";

export interface GatherOptions {
  perSource?: number;
  sources?: Provider[];
}

export interface GatherStat {
  provider: Provider;
  fetched: number;
  error?: string;
}

const REGISTRY: Record<
  string,
  (q: string, limit: number) => Promise<NormalizedDoc[]>
> = {
  europepmc: fetchEuropePmc,
  openalex: fetchOpenAlex,
  arxiv: fetchArxiv,
  reddit: fetchReddit,
};

const DEFAULT_SOURCES: Provider[] = ["europepmc", "openalex", "arxiv", "reddit"];

/**
 * Fan out to every source in parallel. Failures are isolated per-source so one
 * flaky API never sinks the whole query. Returns the merged candidate docs plus
 * per-source stats (handy for the live progress UI).
 */
export async function gatherSources(
  query: string,
  opts: GatherOptions = {},
): Promise<{ docs: NormalizedDoc[]; stats: GatherStat[] }> {
  const perSource = opts.perSource ?? 6;
  const sources = opts.sources ?? DEFAULT_SOURCES;

  const settled = await Promise.allSettled(
    sources.map((provider) => REGISTRY[provider](query, perSource)),
  );

  const docs: NormalizedDoc[] = [];
  const stats: GatherStat[] = [];

  settled.forEach((result, i) => {
    const provider = sources[i];
    if (result.status === "fulfilled") {
      docs.push(...result.value);
      stats.push({ provider, fetched: result.value.length });
    } else {
      stats.push({
        provider,
        fetched: 0,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });

  return { docs, stats };
}
