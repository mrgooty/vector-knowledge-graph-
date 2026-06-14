-- Knowledge Copilot schema — Postgres + pgvector on Supabase.
-- Idempotent: safe to run repeatedly (migrate step).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── documents ────────────────────────────────────────────────────────────
-- A source document of any type. `external_id` is the stable id from the
-- provider (DOI / arXiv id / Stack Overflow id) and is the dedup key for live ingest.
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  TEXT NOT NULL CHECK (source_type IN ('paper', 'chat', 'report')),
  provider     TEXT NOT NULL DEFAULT 'manual', -- europepmc | openalex | arxiv | stackoverflow | report
  external_id  TEXT,                            -- provider-native id (dedup)
  title        TEXT NOT NULL,
  authors      TEXT,
  url          TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One document per provider+external_id (the idempotency guarantee).
CREATE UNIQUE INDEX IF NOT EXISTS documents_provider_external_id_key
  ON documents (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_source_type_idx ON documents (source_type);

-- ── messages ─────────────────────────────────────────────────────────────
-- Chat threads (Stack Overflow Q&A, persisted threads) render from these.
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role         TEXT NOT NULL, -- 'user' | 'assistant' | 'agent'
  body         TEXT NOT NULL,
  position     INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_document_position_idx
  ON messages (document_id, position);

-- ── chunks (the vector store) ────────────────────────────────────────────
-- One row per chunk, any source type. `fts` powers the lexical half of the
-- hybrid search; `embedding` powers the semantic half.
CREATE TABLE IF NOT EXISTS chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL,
  ordinal      INT NOT NULL DEFAULT 0,
  content      TEXT NOT NULL,
  embedding    VECTOR(__EMBEDDING_DIM__),
  token_count  INT,
  fts          TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Don't insert the same chunk twice for a document.
CREATE UNIQUE INDEX IF NOT EXISTS chunks_document_ordinal_key
  ON chunks (document_id, ordinal);

CREATE INDEX IF NOT EXISTS chunks_source_type_idx ON chunks (source_type);

-- Semantic: HNSW cosine. m/ef_construction tuned for quality (research-backed).
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Lexical: GIN over the generated tsvector.
CREATE INDEX IF NOT EXISTS chunks_fts_idx ON chunks USING gin (fts);

-- ── hybrid search (vector + lexical, fused by Reciprocal Rank Fusion) ──────
-- Returns the cited sources for the agent. `similarity` is cosine (0..1) for
-- display; ordering is by the RRF `score` (rrf_k=60 is the standard constant).
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding VECTOR(__EMBEDDING_DIM__),
  query_text      TEXT,
  match_count     INT DEFAULT 6,
  source_filter   TEXT[] DEFAULT NULL,
  rrf_k           INT DEFAULT 60
)
RETURNS TABLE (
  chunk_id    UUID,
  document_id UUID,
  source_type TEXT,
  title       TEXT,
  content     TEXT,
  similarity  DOUBLE PRECISION,
  score       DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  WITH params AS (
    SELECT GREATEST(match_count * 4, 20) AS pool_size
  ),
  vector_hits AS (
    SELECT c.id,
           row_number() OVER (ORDER BY c.embedding <=> query_embedding) AS rk
    FROM chunks c, params
    WHERE c.embedding IS NOT NULL
      AND (source_filter IS NULL OR c.source_type = ANY (source_filter))
    ORDER BY c.embedding <=> query_embedding
    LIMIT (SELECT pool_size FROM params)
  ),
  lexical_hits AS (
    SELECT c.id,
           row_number() OVER (
             ORDER BY ts_rank(c.fts, websearch_to_tsquery('english', query_text)) DESC
           ) AS rk
    FROM chunks c, params
    WHERE (source_filter IS NULL OR c.source_type = ANY (source_filter))
      AND query_text <> ''
      AND c.fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank(c.fts, websearch_to_tsquery('english', query_text)) DESC
    LIMIT (SELECT pool_size FROM params)
  ),
  fused AS (
    SELECT id, sum(1.0 / (rrf_k + rk)) AS score
    FROM (
      SELECT id, rk FROM vector_hits
      UNION ALL
      SELECT id, rk FROM lexical_hits
    ) all_hits
    GROUP BY id
  )
  SELECT c.id AS chunk_id,
         c.document_id,
         c.source_type,
         d.title,
         c.content,
         CASE WHEN c.embedding IS NULL THEN 0
              ELSE 1 - (c.embedding <=> query_embedding) END AS similarity,
         f.score
  FROM fused f
  JOIN chunks c    ON c.id = f.id
  JOIN documents d ON d.id = c.document_id
  ORDER BY f.score DESC
  LIMIT match_count;
$$;
