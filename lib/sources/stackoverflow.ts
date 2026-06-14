import { chunkText } from "../chunk";
import type { NormalizedDoc } from "../types";

// Stack Overflow (live) via the public Stack Exchange API (v2.3). No auth is
// required for low volume; an optional key raises the daily quota. We traverse
// each matching question down to its highest-voted answer so the stored doc is
// a complete Q&A pair. Responses are gzip and decoded automatically by fetch.

const BASE = "https://api.stackexchange.com/2.3";
const SITE = "stackoverflow";

function withKey(url: URL): URL {
  const key = process.env.STACKEXCHANGE_KEY || process.env.STACKOVERFLOW_KEY;
  if (key) url.searchParams.set("key", key);
  return url;
}

function stripHtml(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/gi, (m) => m) // keep code blocks' text
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface SoQuestion {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  tags?: string[];
  score: number;
  is_answered: boolean;
  answer_count: number;
}

interface SoAnswer {
  question_id: number;
  answer_id: number;
  body?: string;
  score: number;
  is_accepted: boolean;
}

/** Fetch the highest-voted answer for each question in a single batched call. */
async function topAnswers(
  questionIds: number[],
): Promise<Map<number, SoAnswer>> {
  const byQuestion = new Map<number, SoAnswer>();
  if (questionIds.length === 0) return byQuestion;

  const url = withKey(
    new URL(`${BASE}/questions/${questionIds.join(";")}/answers`),
  );
  url.searchParams.set("site", SITE);
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "votes");
  url.searchParams.set("filter", "withbody");
  url.searchParams.set("pagesize", "100");

  const res = await fetch(url);
  if (!res.ok) return byQuestion;

  const json = (await res.json()) as { items?: SoAnswer[] };
  for (const ans of json.items ?? []) {
    const existing = byQuestion.get(ans.question_id);
    // Prefer accepted answers, then fall back to the highest score.
    if (
      !existing ||
      (ans.is_accepted && !existing.is_accepted) ||
      (ans.is_accepted === existing.is_accepted && ans.score > existing.score)
    ) {
      byQuestion.set(ans.question_id, ans);
    }
  }
  return byQuestion;
}

export async function fetchStackOverflow(
  query: string,
  limit = 5,
): Promise<NormalizedDoc[]> {
  const url = withKey(new URL(`${BASE}/search/advanced`));
  url.searchParams.set("site", SITE);
  url.searchParams.set("q", query);
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("answers", "1"); // only questions with at least one answer
  url.searchParams.set("filter", "withbody");
  url.searchParams.set("pagesize", String(limit));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Stack Overflow ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }

  const json = (await res.json()) as { items?: SoQuestion[] };
  const questions = (json.items ?? []).filter((q) => Boolean(q?.title));
  if (questions.length === 0) return [];

  const answers = await topAnswers(questions.map((q) => q.question_id));

  return questions.map((q): NormalizedDoc => {
    const question = stripHtml(`${q.title}\n\n${q.body ?? ""}`);
    const answer = answers.get(q.question_id);
    const answerBody = answer?.body ? stripHtml(answer.body) : null;

    const messages: NormalizedDoc["messages"] = [
      { role: "user", body: question },
    ];
    if (answerBody) messages.push({ role: "assistant", body: answerBody });

    const combined = answerBody ? `${question}\n\n${answerBody}` : question;

    return {
      provider: "stackoverflow",
      externalId: String(q.question_id),
      sourceType: "chat",
      title: q.title.slice(0, 300),
      authors: null, // we don't store user handles
      url: q.link,
      metadata: {
        tags: q.tags ?? [],
        score: q.score,
        answerScore: answer?.score ?? null,
        accepted: answer?.is_accepted ?? false,
      },
      messages,
      chunks: chunkText(combined),
    };
  });
}
