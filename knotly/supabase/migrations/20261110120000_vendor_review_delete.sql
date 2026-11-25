-- Vendors can remove reviews they added themselves, as long as the client hasn't verified them.
create policy "vendor removes own unverified reviews" on testimonials for delete
  using (vendor_id = auth.uid() and not verified);
