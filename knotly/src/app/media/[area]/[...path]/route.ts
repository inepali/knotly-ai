// /media/{portfolio|sites}/{path} — the stable address of a public image. It redirects to where the
// file actually lives (a 24-hour signed R2 link, or Supabase's public URL), and the CDN caches the
// redirect, so most loads never run this code and the bytes never pass through Vercel.
import { isPublicArea, isSafePath, publicTarget } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ area: string; path: string[] }> }) {
  const { area, path } = await ctx.params;
  let p = "";
  try {
    p = (path ?? []).map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!isPublicArea(area) || !isSafePath(p)) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: publicTarget(area, p),
      // 1 h at the CDN (the signed link lasts 24 h), browsers re-check each load.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=82800",
    },
  });
}
