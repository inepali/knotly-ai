import { describe, it, expect } from "vitest";
import { deletePhotos, moderatePhotos, setPhotoSettings } from "./photo-share";
import { mockSb, UUID } from "./test-utils";

describe("photo moderation", () => {
  it("updates status for the selected photos", async () => {
    const { sb, called } = mockSb({ guest_photos: { data: [{ id: UUID }] } });
    expect(await moderatePhotos(sb, "u1", { ids: [UUID], status: "approved" })).toEqual({ ok: true, data: { updated: 1 } });
    expect(called("guest_photos", "update")[0].args[0]).toEqual({ status: "approved" });
  });

  it("refuses an unknown status", async () => {
    expect((await moderatePhotos(mockSb().sb, "u1", { ids: [UUID], status: "public" })).ok).toBe(false);
  });

  it("deletes rows and their files", async () => {
    const { sb } = mockSb({ guest_photos: { data: [{ path: "p/x.webp" }] } });
    const removed: string[][] = [];
    (sb as unknown as { storage: unknown }).storage = { from: () => ({ remove: async (p: string[]) => { removed.push(p); return { error: null }; } }) };
    expect(await deletePhotos(sb, "u1", { ids: [UUID] })).toEqual({ ok: true, data: { removed: 1 } });
    expect(removed).toEqual([["p/x.webp"]]);
  });

  it("explains a locked add-on when saving settings", async () => {
    const { sb } = mockSb({ couple_projects: { data: { id: "p1" } }, photo_share_settings: { error: { message: "new row violates row-level security policy" } } });
    expect(await setPhotoSettings(sb, "u1", { approve_first: false })).toEqual({ ok: false, error: "Unlock Guest Photo Sharing first." });
  });
});
