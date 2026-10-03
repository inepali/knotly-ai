-- Vendor knowledge base: links, FAQs and PDFs the vendor adds so their AI assistant
-- (and the couples' assistant) can answer questions accurately.

-- One row per thing the vendor added.
create table vendor_knowledge (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  kind text not null check (kind in ('website', 'instagram', 'facebook', 'youtube', 'link', 'faq', 'pdf')),
  title text,
  url text,                 -- links
  question text,            -- faq
  answer text,              -- faq
  file_path text,           -- pdf, in the vendor-knowledge bucket
  status text not null default 'pending' check (status in ('pending', 'ready', 'error')),
  error text,               -- why it couldn't be read
  chars int,                -- how much text was learned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on vendor_knowledge (vendor_id, created_at);

-- The learned text, split into searchable pieces. Written only by the server.
create table vendor_knowledge_chunks (
  id bigserial primary key,
  source_id uuid not null references vendor_knowledge on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  content text not null,
  embedding vector(1536) not null
);
create index on vendor_knowledge_chunks (vendor_id);
create index on vendor_knowledge_chunks using hnsw (embedding vector_cosine_ops);

alter table vendor_knowledge enable row level security;
alter table vendor_knowledge_chunks enable row level security;

-- Vendors manage their own sources. Status, text and chunks are written by the server.
create policy "vendor reads own knowledge" on vendor_knowledge for select using (vendor_id = auth.uid());
create policy "vendor adds knowledge" on vendor_knowledge for insert
  with check (vendor_id = auth.uid() and status = 'pending');
create policy "vendor removes knowledge" on vendor_knowledge for delete using (vendor_id = auth.uid());
create policy "vendor reads own chunks" on vendor_knowledge_chunks for select using (vendor_id = auth.uid());

-- Closest pieces of one vendor's knowledge to a question. Server-only (agents).
create function match_vendor_knowledge(p_vendor uuid, query_embedding vector(1536), p_limit int default 6)
returns table (source_id uuid, kind text, title text, url text, content text, similarity float)
language sql stable set search_path = public as $$
  select c.source_id, k.kind, k.title, k.url, c.content, 1 - (c.embedding <=> query_embedding)
  from vendor_knowledge_chunks c join vendor_knowledge k on k.id = c.source_id
  where c.vendor_id = p_vendor and k.status = 'ready'
  order by c.embedding <=> query_embedding
  limit p_limit;
$$;
revoke execute on function match_vendor_knowledge from public, anon, authenticated;

-- Private bucket for uploaded PDFs (10 MB each). The server hands out one-time upload
-- URLs and reads files back; there are no public or user-level storage policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-knowledge', 'vendor-knowledge', false, 10485760, array['application/pdf']);
