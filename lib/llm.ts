// Chat-completion helper (synthesis) — Anthropic Claude via the Messages API.
// Swap the model with SYNTHESIS_MODEL. Provides buffered + streaming variants.

const SYNTHESIS_MODEL =
  process.env.SYNTHESIS_MODEL || "claude-3-5-haiku-latest";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = Number(process.env.SYNTHESIS_MAX_TOKENS || 1500);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (and to Vercel env in production).",
    );
  }
  return key;
}

// Anthropic takes the system prompt as a top-level field, not a message role.
function split(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, rest };
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey(),
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const { system, rest } = split(messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: SYNTHESIS_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system,
      messages: rest,
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  return json.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/** Streaming chat: yields text deltas as they arrive. */
export async function* chatStream(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const { system, rest } = split(messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: SYNTHESIS_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system,
      messages: rest,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat stream failed (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data) as {
          type: string;
          delta?: { type?: string; text?: string };
        };
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          if (json.delta.text) yield json.delta.text;
        }
        if (json.type === "message_stop") return;
      } catch {
        // ignore non-JSON keep-alive frames
      }
    }
  }
}

export { SYNTHESIS_MODEL };
