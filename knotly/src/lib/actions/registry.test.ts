import { describe, it, expect } from "vitest";
import { removeClaim, saveRegistryFund, saveRegistryItem, saveRegistryLink } from "./registry";
import { mockSb, UUID } from "./test-utils";

const project = { couple_projects: { data: { id: "p1" } } };

describe("registry actions", () => {
  it("need the add-on", async () => {
    const { sb } = mockSb(project, { data: false });
    expect(await saveRegistryLink(sb, "u1", { url: "https://www.target.com/gift-registry/x" })).toEqual({ ok: false, error: "Unlock the Gift Registry add-on first." });
  });

  it("names a store from its link and appends at the end", async () => {
    const { sb, called } = mockSb({ ...project, registry_links: [{ data: { sort: 2 } }, { data: { id: "l1" } }] }, { data: true });
    expect(await saveRegistryLink(sb, "u1", { url: "https://www.target.com/gift-registry/x" })).toEqual({ ok: true, data: { id: "l1" } });
    expect(called("registry_links", "insert")[0].args[0]).toMatchObject({ store: "Target", sort: 3, project_id: "p1" });
  });

  it("only accepts https links", async () => {
    expect((await saveRegistryLink(mockSb(project, { data: true }).sb, "u1", { url: "http://x.com" })).ok).toBe(false);
    expect((await saveRegistryItem(mockSb(project, { data: true }).sb, "u1", { title: "Mixer", url: "javascript:x" })).ok).toBe(false);
  });

  it("needs a valid way to send money for a fund", async () => {
    const sb = () => mockSb({ ...project, registry_funds: [{ data: null }, { data: { id: "f1" } }] }, { data: true }).sb;
    expect((await saveRegistryFund(sb(), "u1", { title: "Honeymoon", methods: [] })).ok).toBe(false);
    expect((await saveRegistryFund(sb(), "u1", { title: "Honeymoon", methods: [{ kind: "venmo", value: "no spaces!" }] })).ok).toBe(false);
    expect((await saveRegistryFund(sb(), "u1", { title: "Honeymoon", methods: [{ kind: "venmo", value: "@ps" }], goal_cents: 300000 })).ok).toBe(true);
  });

  it("explains the item limit", async () => {
    const { sb } = mockSb({ ...project, registry_items: [{ data: null }, { error: { message: "registry_limit: up to 50 here" } }] }, { data: true });
    expect(await saveRegistryItem(sb, "u1", { title: "Mixer" })).toEqual({ ok: false, error: "You've reached the limit (50) for this list." });
  });

  it("un-claims only what RLS lets the couple see", async () => {
    expect((await removeClaim(mockSb({ registry_claims: { data: [] } }).sb, "u1", { id: UUID })).ok).toBe(false);
    expect((await removeClaim(mockSb({ registry_claims: { data: [{ id: UUID }] } }).sb, "u1", { id: UUID })).ok).toBe(true);
  });
});
