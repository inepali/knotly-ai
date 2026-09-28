import { supabaseServer } from '@/lib/supabase/server';
import { embedText } from '@/lib/embeddings';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  let results: any[] = [];
  if (q) {
    const sb = await supabaseServer();
    const { data } = await sb.rpc('match_vendors', {
      query_embedding: await embedText(q),
      p_lat: 35.2271, p_lng: -80.8431,   // Charlotte
    });
    results = data ?? [];
  }
  return (
    <main className="mx-auto max-w-2xl p-8">
      <form><input name="q" defaultValue={q} placeholder="Describe what you want..."
        className="w-full rounded border px-3 py-2" /></form>
      {results.map((v) => (
        <p key={v.id} className="mt-3">
          <strong>{v.business_name}</strong> ({v.category}) · {(v.similarity * 100).toFixed(0)}% match
          · {Math.round(v.distance_miles)} mi
        </p>
      ))}
    </main>
  );
}