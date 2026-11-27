import { beforeEach, describe, it, expect, vi } from "vitest";
import { fakeStorage } from "@/lib/storage/fake";
import { addSitePhoto, checkSlug, loadSiteEditor, moveSitePhoto, publishSite, saveSite, setSitePassword } from "./website";
import { mockSb } from "./test-utils";

vi.mock("@/lib/storage", () => import("@/lib/storage/fake"));
beforeEach(() => fakeStorage.reset());

const P = "123e4567-e89b-42d3-a456-426614174000";
const project = { id: P, partner_names: "Priya & Sam", wedding_date: "2027-10-16", love_story: "We met" };
const site = { project_id: P, slug: "priya-and-sam", theme: "classic", title: null, sections: [], photos: [], password_hash: null, indexable: false, published_at: null };
const photo = (n: number) => ({ path: `${P}/${String(n).padStart(8, "0")}-e89b-42d3-a456-426614174000.webp`, width: 10, height: 10 });

const db = (o: { active?: boolean; site?: unknown; update?: unknown } = {}) =>
  mockSb(
    {
      couple_projects: { data: project },
      wedding_sites: o.update ? [{ data: o.site ?? null }, o.update as never] : { data: o.site ?? null },
      wedding_events: { data: [] },
      couple_addons: { data: [] },
    },
    { data: o.active ?? true }
  );
const input = { slug: "priya-and-sam", theme: "classic", sections: [{ type: "hero", enabled: true, subtitle: "Hi" }] };

describe("loadSiteEditor", () => {
  it("suggests an address and default sections before the site exists", async () => {
    const r = await loadSiteEditor(db().sb, "u1");
    expect(r.ok && r.data.site).toMatchObject({ exists: false, slug: "priya-and-sam-2027", theme: "classic" });
    expect(r.ok && r.data.site.sections.find((s) => s.type === "story")).toMatchObject({ text: "We met" });
  });
});

describe("saveSite", () => {
  it("needs the add-on", async () => {
    expect(await saveSite(db({ active: false }).sb, "u1", input)).toEqual({ ok: false, error: "Unlock the Wedding Website add-on to edit your site." });
  });

  it("refuses a bad or reserved address", async () => {
    expect((await saveSite(db().sb, "u1", { ...input, slug: "admin" })).ok).toBe(false);
    expect((await saveSite(db().sb, "u1", { ...input, slug: "x" })).ok).toBe(false);
  });

  it("creates the site with every section in order", async () => {
    const { sb, called } = db();
    expect((await saveSite(sb, "u1", input)).ok).toBe(true);
    const row = called("wedding_sites", "insert")[0].args[0] as { sections: { type: string }[]; slug: string };
    expect(row.slug).toBe("priya-and-sam");
    expect(row.sections[0]).toMatchObject({ type: "hero", subtitle: "Hi" });
    expect(row.sections.length).toBeGreaterThan(5);
  });

  it("rejects javascript: links in travel items", async () => {
    const bad = { ...input, sections: [{ type: "travel", enabled: true, items: [{ title: "Hotel", url: "javascript:alert(1)" }] }] };
    expect((await saveSite(db().sb, "u1", bad)).ok).toBe(false);
  });

  it("explains a taken address", async () => {
    const { sb } = db({ site, update: { error: { message: 'duplicate key value violates unique constraint "wedding_sites_slug_key"' } } });
    expect(await saveSite(sb, "u1", input)).toEqual({ ok: false, error: "That address is taken. Try adding your wedding year." });
  });
});

describe("checkSlug", () => {
  it("asks the database whether it's free", async () => {
    const { sb, calls } = mockSb({ couple_projects: { data: project } }, { data: false });
    expect((await checkSlug(sb, "u1", { slug: "priya-and-sam" })).ok).toBe(false);
    expect(calls.find((c) => c.table === "rpc:site_slug_available")?.args[0]).toEqual({ p_slug: "priya-and-sam", p_project: P });
  });
});

describe("password and publishing", () => {
  it("needs 4+ characters and stores only a hash", async () => {
    expect((await setSitePassword(db({ site }).sb, "u1", { password: "abc" })).ok).toBe(false);
    const { sb, called } = db({ site });
    expect((await setSitePassword(sb, "u1", { password: "sunflower" })).ok).toBe(true);
    const upd = called("wedding_sites", "update")[0].args[0] as { password_hash: string };
    expect(upd.password_hash).toMatch(/^scrypt\$/);
    expect(upd.password_hash).not.toContain("sunflower");
  });

  it("needs a saved site to publish", async () => {
    expect((await publishSite(db().sb, "u1", { published: true })).ok).toBe(false);
    expect((await publishSite(db({ site }).sb, "u1", { published: true })).ok).toBe(true);
  });
});

describe("photos", () => {
  it("refuses a path outside the wedding's folder", async () => {
    expect((await addSitePhoto(db({ site }).sb, "u1", { path: "someone-else/x.webp", width: 1, height: 1 })).ok).toBe(false);
  });

  it("stops at 10 and removes the uploaded file", async () => {
    const full = { ...site, photos: Array.from({ length: 10 }, (_, i) => photo(i)) };
    const { sb } = db({ site: full });
    const r = await addSitePhoto(sb, "u1", photo(11));
    expect(r).toEqual({ ok: false, error: "Your site can have up to 10 photos." });
    expect(fakeStorage.calls).toContain(`remove:sites/${photo(11).path}`);
  });

  it("moves a photo to the cover spot", async () => {
    const s = { ...site, photos: [photo(1), photo(2), photo(3)] };
    const { sb, called } = db({ site: s });
    expect((await moveSitePhoto(sb, "u1", { path: photo(3).path, to: 0 })).ok).toBe(true);
    const upd = called("wedding_sites", "update")[0].args[0] as { photos: { path: string }[] };
    expect(upd.photos.map((p) => p.path)).toEqual([photo(3).path, photo(1).path, photo(2).path]);
  });
});
