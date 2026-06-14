import { chunkText } from "../chunk";
import type { NormalizedDoc } from "../types";

// OpenAlex — 250M+ works across all fields. Free; a key raises limits but the
// polite pool (mailto) is enough for demo volumes. Abstracts arrive as an
// inverted index that we reconstruct into text.
const BASE = "https://api.openalex.org/works";

interface OpenAlexWork {
  id?: string;
  doi?: string;
  display_name?: string;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } };
}

function reconstructAbstract(inv?: Record<string, number[]>): string {
  if (!inv) return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, idxs] of Object.entries(inv)) {
    for (const i of idxs) positions.push({ pos: i, word });
  }
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map((p) => p.word).join(" ");
}

export async function fetchOpenAlex(
  query: string,
  limit = 6,
): Promise<NormalizedDoc[]> {
  const url = new URL(BASE);
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set(
    "select",
    "id,doi,display_name,publication_year,abstract_inverted_index,authorships,primary_location",
  );
  // Polite pool + optional key.
  url.searchParams.set("mailto", process.env.OPENALEX_MAILTO || "research@example.com");
  if (process.env.OPENALEX_API_KEY) {
    url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`OpenAlex ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as { results?: OpenAlexWork[] };
  const works = json.results ?? [];

  return works
    .map((w): NormalizedDoc | null => {
      const abstract = reconstructAbstract(w.abstract_inverted_index);
      const title = w.display_name ?? "";
      if (!title || !abstract) return null;

      const externalId = (w.id ?? w.doi ?? title).replace(
        "https://openalex.org/",
        "",
      );
      const authors = (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter(Boolean)
        .slice(0, 8)
        .join(", ");

      return {
        provider: "openalex",
        externalId,
        sourceType: "paper",
        title,
        authors: authors || null,
        url: w.doi ?? w.id ?? null,
        metadata: {
          year: w.publication_year,
          venue: w.primary_location?.source?.display_name,
        },
        chunks: chunkText(`${title}\n\n${abstract}`),
      };
    })
    .filter((d): d is NormalizedDoc => d !== null);
}
