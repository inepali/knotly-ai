-- Fix: vendors couldn't see couples' messages.
-- In 20261002232703_vendor_agent.sql the vendor half of "read messages" said `status = 'sent'`
-- inside `exists (select ... from threads t ...)`, which Postgres resolves to threads.status
-- (always 'open'), not messages.status. So vendors only ever saw their agent's drafts.
-- Every column is table-qualified below so the scope can't be misread again.
--
-- Who sees what:
--   couple: sent messages + their own side's drafts (never the vendor agent's drafts)
--   vendor: sent messages + their own side's drafts (couples' drafts stay private)
drop policy "read messages" on messages;

create policy "read messages" on messages for select using (
  (
    owns_thread(messages.thread_id)
    and (messages.status = 'sent' or messages.sender in ('couple', 'couple_agent'))
  )
  or exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and t.vendor_id = auth.uid()
      and (messages.status = 'sent' or messages.sender in ('vendor', 'vendor_agent'))
  )
);
