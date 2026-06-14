import { chunkText } from "../chunk";
import type { NormalizedDoc } from "../types";

// arXiv — preprints (CS / physics / quant). Atom XML, no auth. We parse the
// feed with small regex extractors to avoid an XML dependency.
const BASE = "http://export.arxiv.org/api/query";

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1].trim()) : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchArxiv(
  query: string,
  limit = 6,
): Promise<NormalizedDoc[]> {
  const url = new URL(BASE);
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));
  url.searchParams.set("sortBy", "relevance");

  const res = await fetch(url, { headers: { Accept: "application/atom+xml" } });
  if (!res.ok) {
    throw new Error(`arXiv ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  return entries
    .map((entry): NormalizedDoc | null => {
      const title = tag(entry, "title");
      const summary = tag(entry, "summary");
      const idUrl = tag(entry, "id");
      if (!title || !summary) return null;

      const externalId = idUrl.replace("http://arxiv.org/abs/", "").trim();
      const authors = (entry.match(/<name>([\s\S]*?)<\/name>/g) ?? [])
        .map((n) => decodeEntities(n.replace(/<\/?name>/g, "")))
        .slice(0, 8)
        .join(", ");

      return {
        provider: "arxiv",
        externalId: externalId || idUrl,
        sourceType: "paper",
        title,
        authors: authors || null,
        url: idUrl || null,
        metadata: { published: tag(entry, "published") },
        chunks: chunkText(`${title}\n\n${summary}`),
      };
    })
    .filter((d): d is NormalizedDoc => d !== null);
}
