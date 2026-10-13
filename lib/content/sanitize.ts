/**
 * Allow-list sanitiser for post bodies.
 *
 * A post's HTML comes from the rich-text editor, is stored, and is later
 * injected into the public site — so whatever an editor account can save, every
 * visitor's browser will run. This rebuilds the HTML from scratch: only the tags
 * the editor can produce survive, every attribute is dropped except a checked
 * `href`, and any `<` that is not part of a recognised tag is escaped. It never
 * tries to "clean" dangerous markup; it only ever emits what is on the list.
 *
 * (Workers have no DOM, so this is a tokenizer rather than a DOM sanitiser.)
 */
const ALLOWED = new Set(["p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "blockquote", "ul", "ol", "li", "a", "code", "pre"]);
const VOID = new Set(["br", "hr"]);
// The editor's h1 would compete with the page's own title; demote it.
const RENAME: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4" };

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
const escapeText = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

function safeHref(attributes: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributes);
  const href = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  // Only real links: no javascript:, data: or anything else with a scheme we did not name.
  if (!/^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(href)) return null;
  return href.replace(/&(?!amp;|#)/g, "&amp;").replace(/"/g, "&quot;");
}

export function sanitizePostHtml(input: string): string {
  let out = "";
  let last = 0;
  for (const match of input.matchAll(TAG)) {
    out += escapeText(input.slice(last, match.index));
    last = match.index + match[0].length;

    const closing = match[0][1] === "/";
    const tag = RENAME[match[1].toLowerCase()] ?? match[1].toLowerCase();
    if (!ALLOWED.has(tag)) continue; // the tag is dropped; its text stays as text

    if (closing) {
      if (!VOID.has(tag)) out += `</${tag}>`;
    } else if (tag === "a") {
      const href = safeHref(match[2]);
      out += href ? `<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">` : "<a>";
    } else {
      out += `<${tag}>`;
    }
  }
  return out + escapeText(input.slice(last));
}

/** Plain text of a post body, for excerpts and descriptions. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
