import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs, resolvers } from "@/lib/graphql";

export const runtime = "nodejs";

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export async function GET(request: Request) {
  return yoga.handleRequest(request, {});
}

export async function POST(request: Request) {
  return yoga.handleRequest(request, {});
}

export async function OPTIONS(request: Request) {
  return yoga.handleRequest(request, {});
}
