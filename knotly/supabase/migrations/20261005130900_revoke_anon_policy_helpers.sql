-- Security advisor: RLS helper functions were executable by anon. Every policy that uses them
-- is `to authenticated`, so anon never needs them. (public_website, find_rsvp, submit_rsvp and
-- shared_timeline stay public on purpose.)
revoke execute on function owns_project(uuid) from public, anon;
revoke execute on function owns_document(uuid) from public, anon;
revoke execute on function owns_timeline_event(uuid) from public, anon;
revoke execute on function can_assign_timeline_vendor(uuid, uuid) from public, anon;
revoke execute on function is_vendor() from public, anon;
grant execute on function owns_project(uuid), owns_document(uuid), owns_timeline_event(uuid),
  can_assign_timeline_vendor(uuid, uuid), is_vendor() to authenticated;
