-- Agent Settings: plain-English rules the structured rule types don't cover.
-- Vendor-only (existing "own settings" RLS on vendor_agent_settings); never shown to couples.
alter table vendor_agent_settings
  add column agent_custom_instructions text
    check (char_length(agent_custom_instructions) <= 1000),
  add column agent_custom_instructions_updated_at timestamptz;
