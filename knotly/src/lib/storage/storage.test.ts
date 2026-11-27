import { describe, expect, it, vi } from "vitest";
import { isSafePath, mediaUrl, providerFor, r2Key, uploadProblem } from "./areas";

vi.mock("@/lib/storage", () => import("@/lib/storage/fake"));

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("storage areas", () => {
  it("keeps everything in one R2 bucket, a folder per area", () => {
    expect(r2Key("guest-photos", `${ID}/x.webp`)).toBe(`guest-photos/${ID}/x.webp`);
  });

  it("only accepts the paths Knotly writes", () => {
    expect(isSafePath(`${ID}/${ID}-thumb.webp`)).toBe(true);
    expect(isSafePath(`${ID}/avatar-1732650000000.png`)).toBe(true);
    expect(isSafePath(`${ID}/../secret.pdf`)).toBe(false);
    expect(isSafePath(`../${ID}/x.webp`)).toBe(false);
    expect(isSafePath(`${ID}/x.svg`)).toBe(false);
    expect(isSafePath(`not-a-uuid/x.webp`)).toBe(false);
  });

  it("builds stable /media links, absolute when asked", () => {
    expect(mediaUrl("sites", `${ID}/a.webp`)).toBe(`/media/sites/${ID}/a.webp`);
    expect(mediaUrl("portfolio", `${ID}/a.webp`, "https://knotly.net/")).toBe(`https://knotly.net/media/portfolio/${ID}/a.webp`);
  });

  it("checks type and size per area", () => {
    expect(uploadProblem("knowledge", "application/pdf", 9_000_000)).toBe(null);
    expect(uploadProblem("knowledge", "application/pdf", 11_000_000)).toMatch(/too large/);
    expect(uploadProblem("portfolio", "image/png", 100)).toMatch(/type/);
    expect(uploadProblem("guest-photos", "image/webp", 0)).toMatch(/too large/);
  });

  it("moves areas to R2 all at once or one by one", () => {
    expect(providerFor("portfolio", {})).toBe("supabase");
    expect(providerFor("portfolio", { STORAGE_PROVIDER: "r2" })).toBe("r2");
    expect(providerFor("portfolio", { STORAGE_R2_AREAS: "sites, portfolio" })).toBe("r2");
    expect(providerFor("avatars", { STORAGE_R2_AREAS: "sites, portfolio" })).toBe("supabase");
  });
});

describe("/media route", () => {
  const get = async (area: string, path: string[]) => {
    const { GET } = await import("@/app/media/[area]/[...path]/route");
    return GET(new Request("https://knotly.net/x"), { params: Promise.resolve({ area, path }) });
  };

  it("redirects public images and lets the CDN cache the redirect", async () => {
    const res = await get("portfolio", [ID, "a.webp"]);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`https://public.test/portfolio/${ID}/a.webp`);
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
  });

  it("never serves private areas or odd paths", async () => {
    expect((await get("guest-photos", [ID, "a.webp"])).status).toBe(404);
    expect((await get("avatars", [ID, "a.webp"])).status).toBe(404);
    expect((await get("sites", ["..", "a.webp"])).status).toBe(404);
    expect((await get("sites", [ID, "%E0%A4%A"])).status).toBe(404);
  });
});
