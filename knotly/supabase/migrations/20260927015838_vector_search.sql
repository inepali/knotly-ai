create extension if not exists vector;

alter table vendors add column embedding vector(1536);
create index on vendors using hnsw (embedding vector_cosine_ops);   -- makes search fast
create index on vendors using gist (location);                      -- makes distance fast

-- Search: closest meaning first, but only vendors that pass the hard filters
create or replace function match_vendors(
  query_embedding vector(1536),
  p_category text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles int default 50,
  p_max_price int default null,
  p_limit int default 8
) returns table (
  id uuid, business_name text, category text, price_min int, price_max int, bio text,
  similarity float, distance_miles float, avg_rating numeric, review_count bigint
)
language sql stable as $$
  with origin as (
    select case when p_lat is null then null
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as g
  )
  select v.id, v.business_name, v.category, v.price_min, v.price_max, left(v.bio, 280),
         1 - (v.embedding <=> query_embedding),                       -- 1 = identical meaning
         case when o.g is null then null else st_distance(v.location, o.g) / 1609.34 end,
         (select round(avg(t.rating), 1) from testimonials t where t.vendor_id = v.id),
         (select count(*) from testimonials t where t.vendor_id = v.id)
  from vendors v, origin o
  where v.published
    and v.embedding is not null
    and (p_category is null or v.category = p_category)
    and (p_max_price is null or v.price_min <= p_max_price)
    and (o.g is null or st_dwithin(v.location, o.g, p_radius_miles * 1609.34))
  order by v.embedding <=> query_embedding
  limit p_limit;
$$;