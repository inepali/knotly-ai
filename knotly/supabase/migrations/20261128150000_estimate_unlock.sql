-- Vendor wallet, step 4: opening an estimate (the paid moment, view_quote) unlocks the vendor's
-- contact details and personal messages (pricing-vendor-wallet-spec.md).
--   * thread_estimate_opened(t)  the couple has opened at least one estimate in this conversation
--   * thread_messaging_open(t)   posted-project threads need an opened estimate; inquiries the
--                                couple started are always open. Checked by the reply route.
--   * thread_vendor_contact(t)   phone / email / website / Instagram, for the couple once an
--                                estimate is opened, and always for the vendor themself.

create function thread_estimate_opened(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quotes q where q.thread_id = t and q.first_viewed_at is not null);
$$;
revoke execute on function thread_estimate_opened(uuid) from public, anon;
grant execute on function thread_estimate_opened(uuid) to authenticated, service_role;

-- False for anyone who isn't in the conversation.
create function thread_messaging_open(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from threads th
     where th.id = t
       and (owns_thread(th.id) or th.vendor_id = auth.uid() or auth.role() = 'service_role')
       and (th.origin = 'inquiry' or thread_estimate_opened(th.id))
  );
$$;
revoke execute on function thread_messaging_open(uuid) from public, anon;
grant execute on function thread_messaging_open(uuid) to authenticated, service_role;

create function thread_vendor_contact(t uuid)
returns table (vendor_id uuid, business_name text, phone text, email text, website text, instagram text)
language sql stable security definer set search_path = public as $$
  select v.id, v.business_name, v.phone, p.email, v.website, v.instagram
    from threads th
    join vendors v on v.id = th.vendor_id
    join profiles p on p.id = v.id
   where th.id = t
     and (th.vendor_id = auth.uid() or (owns_thread(th.id) and thread_estimate_opened(th.id)));
$$;
revoke execute on function thread_vendor_contact(uuid) from public, anon;
grant execute on function thread_vendor_contact(uuid) to authenticated;
