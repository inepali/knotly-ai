-- Vendor can pause the agent on a thread and reply personally
alter table threads
add column vendor_agent_paused boolean not null default false;

-- Fix message visibility now that the vendor's agent writes drafts too:
-- couples never see vendor drafts; vendors see sent messages plus their agent's drafts.
drop policy "read messages" on messages;

create policy "read messages" on messages for
select
    using (
        (
            owns_thread (thread_id)
            and (
                status = 'sent'
                or sender in ('couple', 'couple_agent')
            )
        )
        or exists (
            select
                1
            from
                threads t
            where
                t.id = thread_id
                and t.vendor_id = auth.uid ()
                and (
                    status = 'sent'
                    or sender = 'vendor_agent'
                )
        )
    );

drop policy "couple edits drafts" on messages;

create policy "couple edits drafts" on messages for
update using (
    owns_thread (thread_id)
    and status = 'pending_approval'
    and sender in ('couple', 'couple_agent')
)
with
    check (status = 'pending_approval');

-- Every agent decision is recorded: the vendor's "why did it say that?" timeline
create table
    agent_audit_log (
        id bigserial primary key,
        thread_id uuid references threads on delete cascade,
        agent text not null check (agent in ('client_agent', 'vendor_agent')),
        decision jsonb,
        gate jsonb, -- filled in Lesson 15
        outcome text, -- 'draft', 'sent', 'escalated', 'waiting_credits'
        created_at timestamptz default now ()
    );

alter table agent_audit_log enable row level security;

create policy "vendor reads own agent log" on agent_audit_log for
select
    using (
        exists (
            select
                1
            from
                threads t
            where
                t.id = thread_id
                and t.vendor_id = auth.uid ()
        )
    );