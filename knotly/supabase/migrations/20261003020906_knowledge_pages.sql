-- Website sources are crawled: one row per page found (from the sitemap or links), so the
-- vendor can see what was read, and each learned piece remembers the page it came from.
create table vendor_knowledge_pages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references vendor_knowledge on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  url text not null,
  title text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'error', 'skipped')),
  error text,
  chars int,
  updated_at timestamptz not null default now(),
  unique (source_id, url)
);
create index on vendor_knowledge_pages (source_id);

alter table vendor_knowledge_pages enable row level security;
create policy "vendor reads own pages" on vendor_knowledge_pages for select using (vendor_id = auth.uid());

alter table vendor_knowledge_chunks add column page_url text;

-- Cite the exact page a piece came from (falls back to the source's link).
drop function match_vendor_knowledge(uuid, vector, int);
create function match_vendor_knowledge(p_vendor uuid, query_embedding vector(1536), p_limit int default 6)
returns table (source_id uuid, kind text, title text, url text, content text, similarity float)
language sql stable set search_path = public as $$
  select c.source_id, k.kind, k.title, coalesce(c.page_url, k.url), c.content, 1 - (c.embedding <=> query_embedding)
  from vendor_knowledge_chunks c join vendor_knowledge k on k.id = c.source_id
  where c.vendor_id = p_vendor and k.status = 'ready'
  order by c.embedding <=> query_embedding
  limit p_limit;
$$;
revoke execute on function match_vendor_knowledge from public, anon, authenticated;
