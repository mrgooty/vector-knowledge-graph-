// Shared env loader for CLI scripts (run via tsx). Loads .env.local then .env.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function sslFor(connectionString: string) {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  return isLocal ? undefined : { rejectUnauthorized: false };
}
