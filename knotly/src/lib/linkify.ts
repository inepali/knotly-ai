// src/lib/linkify.ts — turn "[Go to My Wedding →](/client/dashboard/my-wedding)" in a Help answer into
// a link. Only paths inside Knotly are links; anything else (other sites, javascript:, //host) stays plain text,
// so a model that was tricked into writing a bad link can't send someone off-site.

export type Segment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const LINK = /\[([^\]\n]{1,80})\]\(([^)\s]{1,200})\)/g;

/** A same-site path: starts with one "/", no scheme, no protocol-relative "//", no backslashes. */
export function isInternalPath(href: string) {
  return /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%#]*$/.test(href);
}

export function linkify(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of input.matchAll(LINK)) {
    const [whole, label, href] = m;
    const start = m.index!;
    if (!isInternalPath(href)) continue; // leave the markdown as plain text
    if (start > last) out.push({ type: "text", text: input.slice(last, start) });
    out.push({ type: "link", text: label, href });
    last = start + whole.length;
  }
  if (last < input.length) out.push({ type: "text", text: input.slice(last) });
  return out;
}
