-- Mailbox: couples and vendors see conversations as Inbox (new/read), Sent and Drafts.
-- Sent messages are a record of what was said, so they are kept and never edited.

-- 1. Read state and email delivery ---------------------------------------------------
alter table messages
  add column read_at timestamptz,    -- when the recipient first opened it (null = new)
  add column emailed_at timestamptz; -- when the email notification went out (null = not emailed)

create index messages_thread_created on messages (thread_id, created_at);
create index messages_unread on messages (thread_id) where read_at is null and status = 'sent';

-- 2. Preserve history -------------------------------------------------------------------
-- Deleting a wedding or a thread no longer silently deletes its conversation.
alter table threads drop constraint threads_project_id_fkey,
  add constraint threads_project_id_fkey foreign key (project_id)
    references couple_projects on delete restrict;
alter table messages drop constraint messages_thread_id_fkey,
  add constraint messages_thread_id_fkey foreign key (thread_id)
    references threads on delete restrict;

-- Once sent, a message can't be changed or un-sent; only read_at/emailed_at may be filled in.
create function keep_sent_messages() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'sent' then raise exception 'Sent messages are kept and cannot be deleted'; end if;
    return old;
  end if;
  if old.status = 'sent' and (
       new.status is distinct from old.status or new.subject is distinct from old.subject
       or new.body is distinct from old.body or new.sender is distinct from old.sender
       or new.thread_id is distinct from old.thread_id or new.created_at is distinct from old.created_at
       or new.payload is distinct from old.payload) then
    raise exception 'Sent messages cannot be changed';
  end if;
  return new;
end $$;

create trigger keep_sent_messages before update or delete on messages
  for each row execute function keep_sent_messages();

-- 3. Mark a conversation read (only the other side's sent messages) --------------------
create function mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if owns_thread(p_thread) then
    update messages set read_at = now()
     where thread_id = p_thread and status = 'sent' and read_at is null
       and sender in ('vendor', 'vendor_agent');
  elsif exists (select 1 from threads where id = p_thread and vendor_id = auth.uid()) then
    update messages set read_at = now()
     where thread_id = p_thread and status = 'sent' and read_at is null
       and sender in ('couple', 'couple_agent', 'system');
  end if;
end $$;

revoke execute on function mark_thread_read from public, anon;
grant execute on function mark_thread_read to authenticated;

-- 4. Vendors can see the wedding behind a conversation they've received ---------------
-- (couple name, date, city, guests) — but only once the couple has actually sent something.
-- A security-definer helper, because threads' own policy reads couple_projects and a
-- policy here that read threads directly would recurse.
create function vendor_was_contacted(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from threads t join messages m on m.thread_id = t.id
    where t.project_id = p_project and t.vendor_id = auth.uid() and m.status = 'sent'
  );
$$;

create policy "vendor sees contacted weddings" on couple_projects for select
  using (vendor_was_contacted(id));
