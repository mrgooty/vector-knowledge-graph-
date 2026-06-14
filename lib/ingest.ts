import { query } from "./db";
import { embed, toVectorLiteral } from "./embeddings";
import type { NormalizedDoc } from "./types";

export interface IngestResult {
  created: boolean; // false => already in the corpus (deduped, no re-embed)
  documentId: string;
  chunkCount: number;
}

export interface IndexSummary {
  createdDocs: number;
  skippedDocs: number; // already cached -> not re-embedded
  newChunks: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * indexDocs — the Indexer agent's core. Optimized for live ingestion:
 *   1. ONE query to find which docs already exist (dedup).
 *   2. ONE bulk insert of new documents.
 *   3. ONE batched embedding call across ALL new chunks.
 *   4. Grouped bulk inserts of chunks + messages.
 * This collapses what used to be O(docs) embed round-trips into a single burst.
 * ──────────────────────────────────────────────────────────────────────── */
export async function indexDocs(docs: NormalizedDoc[]): Promise<IndexSummary> {
  const withId = docs.filter((d) => d.externalId);
  if (withId.length === 0) {
    return { createdDocs: 0, skippedDocs: docs.length, newChunks: 0 };
  }

  // Dedupe within the incoming batch.
  const seen = new Set<string>();
  const unique = withId.filter((d) => {
    const key = `${d.provider}::${d.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 1. Which of these already exist?
  const existing = await query<{ provider: string; external_id: string }>(
    `SELECT provider, external_id FROM documents
      WHERE (provider, external_id) IN (
        SELECT p, e FROM unnest($1::text[], $2::text[]) AS t(p, e)
      )`,
    [unique.map((d) => d.provider), unique.map((d) => d.externalId)],
  );
  const existingSet = new Set(
    existing.map((r) => `${r.provider}::${r.external_id}`),
  );

  const fresh = unique.filter(
    (d) => !existingSet.has(`${d.provider}::${d.externalId}`),
  );
  const skippedDocs = docs.length - fresh.length;
  if (fresh.length === 0) return { createdDocs: 0, skippedDocs, newChunks: 0 };

  // 2. Bulk insert new documents.
  const docParams: unknown[] = [];
  const docValues = fresh
    .map((d, i) => {
      const b = i * 7;
      docParams.push(
        d.sourceType,
        d.provider,
        d.externalId,
        d.title.slice(0, 1000),
        d.authors ?? null,
        d.url ?? null,
        JSON.stringify(d.metadata ?? {}),
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    })
    .join(",");

  const insertedDocs = await query<{
    id: string;
    provider: string;
    external_id: string;
  }>(
    `INSERT INTO documents (source_type, provider, external_id, title, authors, url, metadata)
     VALUES ${docValues}
     ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING id, provider, external_id`,
    docParams,
  );

  const idByKey = new Map(
    insertedDocs.map((r) => [`${r.provider}::${r.external_id}`, r.id]),
  );

  // 3. Collect chunk + message rows for the docs we actually inserted.
  const chunkRows: {
    docId: string;
    sourceType: string;
    ordinal: number;
    content: string;
  }[] = [];
  const msgRows: {
    docId: string;
    role: string;
    body: string;
    position: number;
  }[] = [];

  for (const d of fresh) {
    const docId = idByKey.get(`${d.provider}::${d.externalId}`);
    if (!docId) continue; // lost an insert race; another writer has it
    d.chunks
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .slice(0, 50)
      .forEach((content, ordinal) =>
        chunkRows.push({ docId, sourceType: d.sourceType, ordinal, content }),
      );
    (d.messages ?? []).forEach((m, position) =>
      msgRows.push({ docId, role: m.role, body: m.body, position }),
    );
  }

  if (msgRows.length > 0) await bulkInsertMessages(msgRows);

  let newChunks = 0;
  if (chunkRows.length > 0) {
    const vectors = await embed(chunkRows.map((c) => c.content));
    await bulkInsertChunks(chunkRows, vectors);
    newChunks = chunkRows.length;
  }

  return { createdDocs: insertedDocs.length, skippedDocs, newChunks };
}

const GROUP = 200;

async function bulkInsertChunks(
  rows: { docId: string; sourceType: string; ordinal: number; content: string }[],
  vectors: number[][],
) {
  for (let g = 0; g < rows.length; g += GROUP) {
    const slice = rows.slice(g, g + GROUP);
    const vecSlice = vectors.slice(g, g + GROUP);
    const params: unknown[] = [];
    const values = slice
      .map((r, i) => {
        const b = i * 6;
        params.push(
          r.docId,
          r.sourceType,
          r.ordinal,
          r.content,
          toVectorLiteral(vecSlice[i]),
          Math.ceil(r.content.length / 4),
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::vector,$${b + 6})`;
      })
      .join(",");
    await query(
      `INSERT INTO chunks (document_id, source_type, ordinal, content, embedding, token_count)
       VALUES ${values}
       ON CONFLICT (document_id, ordinal) DO NOTHING`,
      params,
    );
  }
}

async function bulkInsertMessages(
  rows: { docId: string; role: string; body: string; position: number }[],
) {
  for (let g = 0; g < rows.length; g += GROUP) {
    const slice = rows.slice(g, g + GROUP);
    const params: unknown[] = [];
    const values = slice
      .map((r, i) => {
        const b = i * 4;
        params.push(r.docId, r.role, r.body, r.position);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
      })
      .join(",");
    await query(
      `INSERT INTO messages (document_id, role, body, position) VALUES ${values}`,
      params,
    );
  }
}

/** Backwards-compatible wrapper used by seed scripts. */
export async function ingestMany(docs: NormalizedDoc[]): Promise<IndexSummary> {
  return indexDocs(docs);
}

/* ────────────────────────────────────────────────────────────────────────
 * ingestDoc — single-doc idempotent upsert. Used to persist a conversation
 * (no chunks → not retrievable) where bulk machinery would be overkill.
 * ──────────────────────────────────────────────────────────────────────── */
export async function ingestDoc(doc: NormalizedDoc): Promise<IngestResult> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO documents (source_type, provider, external_id, title, authors, url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      doc.sourceType,
      doc.provider,
      doc.externalId,
      doc.title.slice(0, 1000),
      doc.authors ?? null,
      doc.url ?? null,
      JSON.stringify(doc.metadata ?? {}),
    ],
  );

  if (inserted.length === 0) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM documents WHERE provider = $1 AND external_id = $2`,
      [doc.provider, doc.externalId],
    );
    return { created: false, documentId: existing[0]?.id ?? "", chunkCount: 0 };
  }

  const documentId = inserted[0].id;

  if (doc.messages?.length) {
    for (let i = 0; i < doc.messages.length; i++) {
      const m = doc.messages[i];
      await query(
        `INSERT INTO messages (document_id, role, body, position) VALUES ($1, $2, $3, $4)`,
        [documentId, m.role, m.body, i],
      );
    }
  }

  const contents = doc.chunks
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, 50);

  if (contents.length === 0) return { created: true, documentId, chunkCount: 0 };

  const vectors = await embed(contents);
  await bulkInsertChunks(
    contents.map((content, ordinal) => ({
      docId: documentId,
      sourceType: doc.sourceType,
      ordinal,
      content,
    })),
    vectors,
  );

  return { created: true, documentId, chunkCount: contents.length };
}
