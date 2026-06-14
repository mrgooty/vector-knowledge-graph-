export type SourceType = "paper" | "chat" | "report";

export type Provider =
  | "europepmc"
  | "openalex"
  | "arxiv"
  | "reddit"
  | "report"
  | "manual";

export interface NormalizedMessage {
  role: "user" | "assistant" | "agent";
  body: string;
}

/** A provider-agnostic document ready to be ingested into pgvector. */
export interface NormalizedDoc {
  provider: Provider;
  externalId: string;
  sourceType: SourceType;
  title: string;
  authors?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
  chunks: string[];
  messages?: NormalizedMessage[];
}

/** A retrieved chunk = one cited source in the UI. */
export interface SourceChunk {
  chunk_id: string;
  document_id: string;
  source_type: SourceType;
  title: string;
  content: string;
  similarity: number;
  score: number;
}
