// Best-effort PII scrubbing for live Reddit content. We never store the author
// handle; this strips residual identifiers from post/comment bodies. This is a
// governance guardrail, not a guarantee — see the README's provenance section.

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const REDDIT_USER = /\b(?:\/?u\/)[A-Za-z0-9_-]{2,21}\b/g;
const MENTION = /(^|\s)@[A-Za-z0-9_]{2,}/g;

export function scrubPII(text: string): string {
  if (!text) return "";
  return text
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[phone removed]")
    .replace(REDDIT_USER, "[user]")
    .replace(MENTION, "$1[user]")
    .replace(/\s+/g, " ")
    .trim();
}
