import { chunkText } from "../chunk";
import { scrubPII } from "../sanitize";
import type { NormalizedDoc } from "../types";

// Reddit (live) via the official OAuth2 API. App-only ("client_credentials")
// token, restricted to health subreddits. Governance guardrails:
//   - we never persist the author handle,
//   - bodies are PII-scrubbed before storage,
//   - non-commercial use, polite rate (a few calls per query).
// Returns [] gracefully if creds are absent so the build never blocks.

const HEALTH_SUBS = "AskDocs+Health+medical+AskDocs+medicine";

let cachedToken: { token: string; expiresAt: number } | null = null;

function userAgent(): string {
  return process.env.REDDIT_USER_AGENT || "knowledge-copilot/0.1";
}

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Reddit token ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
}

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  subreddit: string;
  num_comments: number;
}

async function topComment(token: string, postId: string): Promise<string | null> {
  const res = await fetch(
    `https://oauth.reddit.com/comments/${postId}?limit=3&depth=1&sort=top&raw_json=1`,
    { headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent() } },
  );
  if (!res.ok) return null;

  const json = (await res.json()) as Array<{
    data?: { children?: Array<{ kind: string; data?: { body?: string } }> };
  }>;
  const comments = json[1]?.data?.children ?? [];
  for (const c of comments) {
    if (c.kind === "t1" && c.data?.body && c.data.body !== "[deleted]") {
      return c.data.body;
    }
  }
  return null;
}

export async function fetchReddit(
  query: string,
  limit = 5,
): Promise<NormalizedDoc[]> {
  const token = await getToken();
  if (!token) {
    console.warn("Reddit creds not set — skipping Reddit source.");
    return [];
  }

  const url = new URL(`https://oauth.reddit.com/r/${HEALTH_SUBS}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "true");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("type", "link");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent() },
  });
  if (!res.ok) {
    throw new Error(`Reddit search ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as {
    data?: { children?: Array<{ data?: RedditPost }> };
  };
  const posts = (json.data?.children ?? [])
    .map((c) => c.data)
    .filter((p): p is RedditPost => Boolean(p?.title));

  const docs: NormalizedDoc[] = [];
  for (const post of posts) {
    const question = scrubPII(`${post.title}\n\n${post.selftext ?? ""}`);
    const answerRaw = post.num_comments > 0 ? await topComment(token, post.id) : null;
    const answer = answerRaw ? scrubPII(answerRaw) : null;

    const messages: NormalizedDoc["messages"] = [
      { role: "user", body: question },
    ];
    if (answer) messages.push({ role: "assistant", body: answer });

    const combined = answer ? `${question}\n\n${answer}` : question;

    docs.push({
      provider: "reddit",
      externalId: post.id,
      sourceType: "chat",
      title: scrubPII(post.title).slice(0, 300),
      authors: null, // deliberately never store the author
      url: `https://www.reddit.com${post.permalink}`,
      metadata: { subreddit: post.subreddit },
      messages,
      chunks: chunkText(combined),
    });
  }

  return docs;
}
