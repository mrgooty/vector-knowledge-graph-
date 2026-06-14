import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { sslFor } from "./_env";
import { embeddingDim, embeddingProvider, embeddingModel } from "../lib/embeddings";

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Set DIRECT_URL (preferred) or DATABASE_URL in .env.local before migrating.",
    );
  }

  const dim = embeddingDim();
  const sql = readFileSync(join(process.cwd(), "lib", "schema.sql"), "utf8").replace(
    /__EMBEDDING_DIM__/g,
    String(dim),
  );

  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
  });

  console.log(
    `→ Embeddings: ${embeddingProvider()} / ${embeddingModel()} (dim ${dim})`,
  );
  console.log("→ Connecting to database…");
  await client.connect();

  console.log("→ Applying schema (extensions, tables, indexes, search fn)…");
  await client.query(sql);

  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename IN ('documents','messages','chunks')
     ORDER BY tablename`,
  );

  await client.end();
  console.log(
    `✓ Migration complete. Tables present: ${rows.map((r) => r.tablename).join(", ")}`,
  );
}

main().catch((err) => {
  console.error("✗ Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
