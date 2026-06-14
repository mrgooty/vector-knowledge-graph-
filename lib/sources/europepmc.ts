import { chunkText } from "../chunk";
import type { NormalizedDoc } from "../types";

// Europe PMC — biomedical literature, open access, no API key required.
// Docs: https://europepmc.org/RestfulWebService
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

interface EpmcResult {
  id?: string;
  source?: string;
  title?: string;
  authorString?: string;
  abstractText?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  pubYear?: string;
  journalTitle?: string;
}

export async function fetchEuropePmc(
  query: string,
  limit = 6,
): Promise<NormalizedDoc[]> {
  const url = new URL(BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("sort", "relevance");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Europe PMC ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as {
    resultList?: { result?: EpmcResult[] };
  };
  const results = json.resultList?.result ?? [];

  return results
    .filter((r) => r.title && r.abstractText)
    .map((r) => {
      const externalId = `${r.source ?? "MED"}:${r.id ?? r.pmid ?? r.doi}`;
      const url =
        (r.doi && `https://doi.org/${r.doi}`) ||
        (r.pmcid && `https://europepmc.org/article/PMC/${r.pmcid}`) ||
        (r.pmid && `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`) ||
        undefined;

      const body = `${r.title}\n\n${r.abstractText}`;

      return {
        provider: "europepmc",
        externalId,
        sourceType: "paper",
        title: r.title!,
        authors: r.authorString ?? null,
        url,
        metadata: {
          journal: r.journalTitle,
          year: r.pubYear,
          doi: r.doi,
          pmid: r.pmid,
        },
        chunks: chunkText(body),
      } satisfies NormalizedDoc;
    });
}
