-- MVP Phase 0 security fixes (GAP_ANALYSIS §5). S-2 (estimate price readable before opening)
-- starts in 20261005130200_billing.sql with view_quote(); hiding quotes.total from direct
-- selects waits until the app reads estimates through view_quote() (see docs/status/db.md).

-- S-3: only vendor accounts may create or edit a listing -----------------------------------
create function is_vendor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'vendor');
$$;

drop policy "vendor edits own listing" on vendors;
create policy "vendor edits own listing" on vendors for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_vendor());

-- Columns the server owns (search embedding, URL slug, billing) can't be written by users.
-- published and price_min/max stay user-writable until the publish and package flows move
-- to server actions (the existing assistant tools write them with the user's client).
revoke insert, update on vendors from authenticated, anon;
grant insert (id, business_name, category, bio, metro_slug, location, service_radius_miles,
              price_min, price_max, website, phone, instagram, photos, published, updated_at)
  on vendors to authenticated;
grant update (business_name, category, bio, metro_slug, location, service_radius_miles,
              price_min, price_max, website, phone, instagram, photos, published, updated_at)
  on vendors to authenticated;

-- S-4: security-definer and trigger functions aren't callable through the API ---------------
revoke execute on function vendor_credit_balance(uuid) from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function welcome_credits() from public, anon, authenticated;
revoke execute on function create_vendor_settings() from public, anon, authenticated;
revoke execute on function keep_sent_messages() from public, anon, authenticated;
revoke execute on function set_vendor_slug() from public, anon, authenticated;
revoke execute on function sync_budget_estimate() from public, anon, authenticated;
revoke execute on function touch_updated_at() from public, anon, authenticated;
