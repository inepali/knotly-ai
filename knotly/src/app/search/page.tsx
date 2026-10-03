// src/app/search/page.tsx — search published vendors by describing what you want.
import { supabaseServer } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { fieldClasses } from "@/components/ui/fields";

type Result = {
  id: string;
  business_name: string;
  category: string;
  price_min: number | null;
  bio: string | null;
  similarity: number;
  distance_miles: number | null;
  avg_rating: number | null;
  review_count: number;
};

export default async function SearchPage(props: PageProps<"/search">) {
  const { q: raw } = await props.searchParams;
  const q = typeof raw === "string" ? raw.trim() : "";
  let results: Result[] = [];
  if (q) {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("match_vendors", {
      query_embedding: await embedText(q),
      p_lat: 35.2271,
      p_lng: -80.8431, // Charlotte
    });
    results = (data as Result[] | null) ?? [];
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 pb-16">
        <Container>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-medium tracking-tight text-gray-900">Find vendors</h1>
            <p className="mt-2 text-lg text-gray-600">Describe what you&apos;re looking for, in your own words.</p>
          </div>
          <form className="mt-8 flex max-w-2xl gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. moody, film-style photographer near Charlotte"
              aria-label="What are you looking for?"
              className={fieldClasses}
            />
            <Button type="submit" color="cyan" className="flex-none">
              Search
            </Button>
          </form>

          {q && results.length === 0 && <p className="mt-10 text-gray-600">No matches. Try different words.</p>}
          {results.length > 0 && (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((v) => (
                <article
                  key={v.id}
                  className="flex flex-col rounded-3xl bg-white p-6 shadow-lg shadow-gray-900/5 ring-1 ring-gray-900/5"
                >
                  <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">
                    {v.category.replace("_", " & ")}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-gray-900">{v.business_name}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {v.price_min ? `From $${v.price_min.toLocaleString()}` : "Pricing on request"}
                    {v.avg_rating ? ` · ${v.avg_rating}★ (${v.review_count})` : ""}
                    {v.distance_miles != null ? ` · ${Math.round(v.distance_miles)} mi` : ""}
                  </p>
                  {v.bio && <p className="mt-3 line-clamp-3 text-sm text-gray-700">{v.bio}</p>}
                  <div className="mt-auto flex items-center justify-between pt-6 text-sm">
                    <span className="text-gray-500">{Math.round(v.similarity * 100)}% match</span>
                    <Button href="/chat" variant="outline">
                      Ask Knotly
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
