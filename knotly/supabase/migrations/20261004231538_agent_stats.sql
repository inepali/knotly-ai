-- pnpm supabase migration new agent_stats
create view
    vendor_agent_stats
with
    (security_invoker = true) as
select
    t.vendor_id,
    count(*) filter (
        where
            l.outcome = 'sent'
    ) as sent_alone,
    count(*) filter (
        where
            l.outcome = 'escalated'
    ) as escalated,
    count(*) filter (
        where
            l.outcome = 'human_approved'
    ) as approved_as_is,
    count(*) filter (
        where
            l.outcome in ('human_edited', 'human_guided')
    ) as changed_by_human
from
    agent_audit_log l
    join threads t on t.id = l.thread_id
where
    l.agent = 'vendor_agent'
    and l.created_at > now () - interval '30 days'
group by
    t.vendor_id;