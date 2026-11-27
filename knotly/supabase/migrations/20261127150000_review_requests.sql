-- Review requests: a vendor asks a past client for a review, by email or (for a couple they've
-- talked to on Knotly) inside Knotly. See claude/review-requests-spec.md.
--
-- Where a review came from decides how it's labelled:
--   vendor        : pasted by the vendor              → "Added by vendor"
--   email_request : written by someone the vendor emailed a one-time link to → "Invited review"
--                   (the vendor chose the address, so it isn't proof of a real client)
--   knotly_client : written by a signed-in couple who talked to the vendor on Knotly → verified

alter table testimonials
  add column if not exists source text not null default 'vendor'
    check (source in ('vendor', 'email_request', 'knotly_client')),
  add column if not exists couple_id uuid references profiles on delete set null;

-- Vendors may only add their own pasted reviews: unverified, source 'vendor', no couple attached.
drop policy if exists "vendor adds unverified reviews" on testimonials;
create policy "vendor adds unverified reviews" on testimonials for insert
  with check (vendor_id = auth.uid() and verified = false and source = 'vendor' and couple_id is null);

-- Vendors can remove only reviews they pasted themselves, not ones clients wrote (so a vendor
-- can't quietly delete an unhappy client's review).
drop policy if exists "vendor removes own unverified reviews" on testimonials;
create policy "vendor removes own unverified reviews" on testimonials for delete
  using (vendor_id = auth.uid() and not verified and source = 'vendor');

-- Existing rows: anything already verified came from a real client.
update testimonials set source = 'knotly_client' where verified and source = 'vendor';

create table review_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  -- Exactly one recipient: an email address, or a couple on Knotly.
  recipient_name text not null check (char_length(recipient_name) between 1 and 80),
  recipient_email text check (recipient_email is null or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  couple_id uuid references profiles on delete cascade,
  project_id uuid references couple_projects on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  -- Only a SHA-256 hash of the email link's token is stored; the token itself is only in the email.
  token_hash text unique,
  status text not null default 'sent' check (status in ('sent', 'completed', 'canceled')),
  testimonial_id uuid references testimonials on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  completed_at timestamptz,
  constraint review_request_one_recipient check ((recipient_email is null) <> (couple_id is null)),
  constraint review_request_email_has_token check (recipient_email is null or token_hash is not null)
);

-- One open request per recipient per vendor.
create unique index review_requests_open_email on review_requests (vendor_id, lower(recipient_email))
  where status = 'sent' and recipient_email is not null;
create unique index review_requests_open_couple on review_requests (vendor_id, couple_id)
  where status = 'sent' and couple_id is not null;
create index review_requests_vendor on review_requests (vendor_id, created_at desc);
create index review_requests_couple on review_requests (couple_id) where couple_id is not null;

alter table review_requests enable row level security;

-- Vendors see and cancel their own requests.
create policy "vendor sees own review requests" on review_requests for select using (vendor_id = auth.uid());
create policy "vendor cancels own review requests" on review_requests for update
  using (vendor_id = auth.uid() and status = 'sent')
  with check (vendor_id = auth.uid() and status = 'canceled');

-- Vendors create requests: to an email, or to a couple they have a conversation with.
create policy "vendor asks for a review" on review_requests for insert with check (
  vendor_id = auth.uid()
  and status = 'sent'
  and testimonial_id is null
  and (
    couple_id is null
    or exists (
      select 1 from threads t join couple_projects p on p.id = t.project_id
      where t.vendor_id = auth.uid() and p.couple_id = review_requests.couple_id
        and (review_requests.project_id is null or p.id = review_requests.project_id)
    )
  )
);

-- Couples see requests addressed to them (to write the review in their dashboard).
create policy "couple sees review requests to them" on review_requests for select using (couple_id = auth.uid());

-- Writing the review (and marking the request completed) happens on the server with the
-- service role, after it checks the token or the signed-in couple. No other writes are allowed.
