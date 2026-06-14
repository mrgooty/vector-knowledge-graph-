# Knowledge Copilot

A live research agent. Ask one natural-language question and it goes to the
internet, pulls relevant **research papers** and **Reddit health discussions**
(plus seeded **reports**), indexes them into a Postgres + `pgvector` store on the
fly, then synthesizes a **cited** answer — with every source shown and scored.

Built in a TypeScript / Next.js / Postgres / React stack and deployed on
**Vercel + Supabase**.

---

## Architecture — two data paths

```
HUMAN BROWSING                         AGENT ANSWERING
React UI (/browse)                     React UI (/ask)
   │                                      │  POST /api/ask  (streamed)
   │  GraphQL query                       ▼
   ▼                                   Agent (LangGraph.js)
GraphQL resolver (graphql-yoga)         ├─ gather    → fetch papers + Reddit IN PARALLEL,
   │                                    │              dedup, embed ONLY new, upsert
   ▼                                    ├─ retrieve  → MCP search_knowledge (HYBRID: vector + lexical, RRF)
Postgres (documents + messages)         ├─ synthesize→ LLM cites by [n], answers only from chunks
                                        └─ assemble  → answer + scored sources
                                                       │
Postgres + pgvector (chunks) ◄──────────── governed via MCP only ───────────────┘
```

**The decision that matters:** GraphQL is for *human navigation* — typed,
multi-domain reads for the UI. **MCP** is for *agent computation* — the agent
calls a governed tool that hits the vector store directly, so retrieval never
round-trips through the API layer. Two consumers, two contracts, one source of
truth.

---

## How the live ingestion is optimized

- **Idempotent upserts** keyed by `(provider, external_id)` — a paper or thread
  already in the corpus is never re-embedded. This is the biggest cost saver.
- **Hybrid search**: pgvector (HNSW, cosine) **+** Postgres full-text, fused with
  **Reciprocal Rank Fusion** (`rrf_k = 60`). Hybrid materially beats pure vector
  search on retrieval precision, with zero extra infrastructure.
- **Parallel source fan-out** with per-source failure isolation.
- **Streamed** ingestion progress + answer tokens, so the agent feels alive.

HNSW is tuned at `m = 16`, `ef_construction = 128` (see `lib/schema.sql`).

---

## Sources

| Provider | What | Auth |
|---|---|---|
| **Europe PMC** | Biomedical literature (primary) | none |
| **OpenAlex** | 250M+ works, all fields | optional key |
| **arXiv** | Preprints (CS/physics) | none |
| **Reddit** | Live health-subreddit discussions | OAuth2 app |

---

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values below
npm run migrate                    # creates extensions, tables, indexes, search fn
npm run dev
```

Optionally pre-warm the corpus (not required — the agent ingests live):

```bash
npm run seed:papers "intermittent fasting metabolic health"
npm run seed:reddit "chronic fatigue"
npm run seed:reports
# or: npm run seed:all
```

### Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **pooled** connection (port 6543) — app runtime |
| `DIRECT_URL` | Supabase **direct** connection (port 5432) — migrations |
| `ANTHROPIC_API_KEY` | Answer synthesis (Claude, Messages API) |
| `SYNTHESIS_MODEL` | Optional chat model override (default `claude-3-5-haiku-latest`) |
| `VOYAGE_API_KEY` **or** `OPENAI_API_KEY` | Embeddings — see note below |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | Reddit OAuth2 |
| `OPENALEX_API_KEY` / `OPENALEX_MAILTO` | Optional, raises OpenAlex limits |

> **Embeddings provider:** Anthropic has no embeddings API. Set **`VOYAGE_API_KEY`**
> to run fully OpenAI-free (Voyage is Anthropic's recommended partner; dim = 1024),
> or set `OPENAI_API_KEY` to use OpenAI embeddings (dim = 1536). The provider is
> auto-detected (Voyage wins if both are set). The vector column dimension is
> fixed at migrate time from the chosen provider — re-run `npm run migrate` if you
> switch providers.

---

## Deploy: Vercel + Supabase

1. **Supabase** → New project. Project Settings → Database → copy both the
   **Transaction pooler** string (→ `DATABASE_URL`) and the **Direct
   connection** string (→ `DIRECT_URL`). `pgvector` is enabled automatically by
   `npm run migrate` (`CREATE EXTENSION vector`).
2. Push this repo to **GitHub**.
3. **Vercel** → Import the GitHub repo. Add all env vars above. Deploy.
4. Run the migration once against Supabase (locally with `DIRECT_URL` pointed at
   Supabase, or from a one-off shell): `npm run migrate`.
5. Open the deployment, go to `/ask`, and ask a question that spans all three
   source types.

---

## Data provenance & governance

- **arXiv** — open-access preprints, fetched via the public API.
- **Europe PMC / OpenAlex** — open scholarly metadata and abstracts; we store
  titles/abstracts and link back to the original.
- **Reddit** — public posts via the **official OAuth2 API** (non-commercial
  tier). Governance guardrails baked in:
  - author handles are **never stored**,
  - post/comment bodies are **PII-scrubbed** on ingest (`lib/sanitize.ts`):
    emails, phone numbers, and user mentions are redacted,
  - restricted to health subreddits, polite rate, results linked back to source.

  This is a best-effort guardrail, not a guarantee. For a stricter posture, swap
  the live Reddit connector for a licensed, de-identified research dataset.
- **Reports** — synthetic, clearly tagged `synthetic: true`.

---

## Project layout

```
app/
  page.tsx              landing
  ask/page.tsx          ask surface (live progress + scored sources)
  browse/page.tsx       browse docs/chats via GraphQL
  api/ask/route.ts      streamed agent endpoint
  api/graphql/route.ts  graphql-yoga handler
lib/
  db.ts                 shared pg pool (Supabase)
  schema.sql            tables + pgvector + pg_trgm + RRF search fn
  embeddings.ts         embeddings (Voyage or OpenAI, auto-detected)
  llm.ts                synthesis (Anthropic Claude)
  chunk.ts sanitize.ts  chunking + PII scrubbing
  ingest.ts             idempotent upsert (dedup, embed-only-new)
  graphql.ts            SDL + resolvers (human path)
  sources/              europepmc, openalex, arxiv, reddit + aggregator
mcp/
  tools.ts server.ts client.ts   MCP: search_knowledge, get_document
agent/
  nodes.ts graph.ts run.ts        LangGraph: gather→retrieve→synthesize→assemble
scripts/
  migrate.ts seed-*.ts            DB migration + corpus pre-warming
```
# vector-knowledge-graph-
# vector-knowledge-graph-
