import { describe, it, expect, beforeEach } from "vitest";
import { devUnlockAll, ensureDevAddons, resetDevGrants } from "./dev-addons";
import { mockSb } from "./actions/test-utils";

const ON = { DEV_UNLOCK_ALL_ADDONS: "true", VERCEL_ENV: "preview" };
const catalog = { addon_catalog: { data: [{ key: "website" }, { key: "rsvp" }] }, couple_addons: {} };

describe("devUnlockAll", () => {
  it("is on only with the flag, and never on Vercel Production", () => {
    expect(devUnlockAll(ON)).toBe(true);
    expect(devUnlockAll({ DEV_UNLOCK_ALL_ADDONS: "true" })).toBe(true); // local dev
    expect(devUnlockAll({ DEV_UNLOCK_ALL_ADDONS: "true", VERCEL_ENV: "production" })).toBe(false);
    expect(devUnlockAll({ DEV_UNLOCK_ALL_ADDONS: "1" })).toBe(false);
    expect(devUnlockAll({})).toBe(false);
  });
});

describe("ensureDevAddons", () => {
  beforeEach(() => resetDevGrants());

  it("grants every one-time add-on once, without overwriting real purchases", async () => {
    const { sb, called } = mockSb(catalog);
    expect(await ensureDevAddons(sb, "p1", ON)).toBe(true);
    const [rows, opts] = called("couple_addons", "upsert")[0].args as [{ addon_key: string; source: string }[], { ignoreDuplicates: boolean }];
    expect(rows.map((r) => [r.addon_key, r.source])).toEqual([["website", "admin"], ["rsvp", "admin"]]);
    expect(opts.ignoreDuplicates).toBe(true);
    expect(called("addon_catalog", "eq").map((c) => c.args)).toEqual([["active", true], ["kind", "one_time"]]);
    expect(await ensureDevAddons(sb, "p1", ON)).toBe(false); // cached
  });

  it("does nothing when the flag is off or in production", async () => {
    const { sb, calls } = mockSb(catalog);
    expect(await ensureDevAddons(sb, "p1", {})).toBe(false);
    expect(await ensureDevAddons(sb, "p1", { DEV_UNLOCK_ALL_ADDONS: "true", VERCEL_ENV: "production" })).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
