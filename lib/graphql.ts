import { query } from "./db";

// SDL kept inline (mirrors lib/schema.graphql) so it bundles cleanly on Vercel
// without filesystem reads at runtime.
export const typeDefs = /* GraphQL */ `
  scalar JSON

  type Message {
    id: ID!
    role: String!
    body: String!
    position: Int!
  }

  type Document {
    id: ID!
    sourceType: String!
    provider: String!
    title: String!
    authors: String
    url: String
    metadata: JSON
    createdAt: String!
    messageCount: Int!
    messages: [Message!]!
  }

  type Query {
    documents(sourceType: String, limit: Int): [Document!]!
    document(id: ID!): Document
  }
`;

interface DocumentRow {
  id: string;
  source_type: string;
  provider: string;
  title: string;
  authors: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: string | Date;
  message_count: number;
}

function mapDocument(row: DocumentRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    provider: row.provider,
    title: row.title,
    authors: row.authors,
    url: row.url,
    metadata: row.metadata,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    messageCount: Number(row.message_count ?? 0),
  };
}

export const resolvers = {
  Query: {
    async documents(
      _: unknown,
      args: { sourceType?: string; limit?: number },
    ) {
      const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
      const rows = await query<DocumentRow>(
        `SELECT d.id, d.source_type, d.provider, d.title, d.authors, d.url,
                d.metadata, d.created_at,
                (SELECT count(*) FROM messages m WHERE m.document_id = d.id) AS message_count
           FROM documents d
          WHERE ($1::text IS NULL OR d.source_type = $1)
          ORDER BY d.created_at DESC
          LIMIT $2`,
        [args.sourceType ?? null, limit],
      );
      return rows.map(mapDocument);
    },

    async document(_: unknown, args: { id: string }) {
      const rows = await query<DocumentRow>(
        `SELECT d.id, d.source_type, d.provider, d.title, d.authors, d.url,
                d.metadata, d.created_at,
                (SELECT count(*) FROM messages m WHERE m.document_id = d.id) AS message_count
           FROM documents d WHERE d.id = $1`,
        [args.id],
      );
      return rows[0] ? mapDocument(rows[0]) : null;
    },
  },

  Document: {
    async messages(parent: { id: string }) {
      return query(
        `SELECT id, role, body, position FROM messages
          WHERE document_id = $1 ORDER BY position`,
        [parent.id],
      );
    },
  },
};
