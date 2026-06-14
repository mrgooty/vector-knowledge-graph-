// Embedding helper. Anthropic has no embeddings API, so this is provider-
// agnostic: it auto-selects Voyage AI (Anthropic's recommended embeddings
// partner) when VOYAGE_API_KEY is present, otherwise OpenAI. Pick Voyage to run
// fully OpenAI-free. The vector dimension follows the provider/model.

const MAX_BATCH = 100;
const BATCH_CONCURRENCY = 4;

type Provider = "voyage" | "openai";

export function embeddingProvider(): Provider {
  const explicit = process.env.EMBEDDINGS_PROVIDER?.toLowerCase();
  if (explicit === "voyage" || explicit === "openai") return explicit;
  return process.env.VOYAGE_API_KEY ? "voyage" : "openai";
}

export function embeddingModel(): string {
  if (process.env.EMBEDDING_MODEL) return process.env.EMBEDDING_MODEL;
  return embeddingProvider() === "voyage"
    ? "voyage-3-large"
    : "text-embedding-3-small";
}

export function embeddingDim(): number {
  if (process.env.EMBEDDING_DIM) return Number(process.env.EMBEDDING_DIM);
  return embeddingProvider() === "voyage" ? 1024 : 1536;
}

function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `${name} is not set. Add it to .env.local (and to Vercel env in production).`,
    );
  }
  return key;
}

async function embedOpenAI(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireKey("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input: inputs,
      dimensions: embeddingDim(),
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedVoyage(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireKey("VOYAGE_API_KEY")}`,
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input: inputs,
      output_dimension: embeddingDim(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  return embeddingProvider() === "voyage"
    ? embedVoyage(inputs)
    : embedOpenAI(inputs);
}

/**
 * Embed an array of texts. Batches up to 100 inputs per request and fires up to
 * BATCH_CONCURRENCY batches in parallel.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim() || " ");

  const batches: string[][] = [];
  for (let i = 0; i < cleaned.length; i += MAX_BATCH) {
    batches.push(cleaned.slice(i, i + MAX_BATCH));
  }

  const out: number[][] = [];
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const slice = batches.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.all(slice.map((b) => embedBatch(b)));
    for (const vecs of settled) out.push(...vecs);
  }

  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  return vec;
}

/** pgvector text literal, e.g. "[0.12,0.34,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
