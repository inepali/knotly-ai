-- Vendors can no longer add reviews themselves: every new review comes from a client, through a
-- review request (written on the server). Older pasted reviews stay ("Added by vendor") and the
-- vendor can still delete those.
drop policy if exists "vendor adds unverified reviews" on testimonials;
