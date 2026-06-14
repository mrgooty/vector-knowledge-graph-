import { Pool, type PoolClient, type QueryResultRow } from "pg";

// A single shared pool, reused across hot reloads in dev and across warm
// serverless invocations on Vercel. We point DATABASE_URL at Supabase's
// transaction pooler (port 6543) in production.
declare global {
  // eslint-disable-next-line no-var
  var __kc_pool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.local.example to .env.local and fill in your Supabase connection string.",
    );
  }

  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  return new Pool({
    connectionString,
    // Supabase requires TLS; the pooled cert chain is not in Node's store.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export function getPool(): Pool {
  if (!global.__kc_pool) {
    global.__kc_pool = createPool();
  }
  return global.__kc_pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never);
  return result.rows;
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
