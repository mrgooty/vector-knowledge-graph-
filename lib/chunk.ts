// Lightweight, dependency-free chunker. Splits on paragraph boundaries and
// packs into ~maxChars windows with a small overlap so context isn't lost at
// the seams. Good enough for abstracts, sections, and discussion threads.

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

export function chunkText(
  text: string,
  { maxChars = 1200, overlap = 150 }: ChunkOptions = {},
): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = trimmed.length > overlap ? trimmed.slice(-overlap) : "";
  };

  for (const para of paragraphs) {
    // A single huge paragraph: hard-split by sentence/length.
    if (para.length > maxChars) {
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (current.length + sentence.length + 1 > maxChars) flush();
        current += (current ? " " : "") + sentence;
      }
      continue;
    }

    if (current.length + para.length + 2 > maxChars) flush();
    current += (current ? "\n\n" : "") + para;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
