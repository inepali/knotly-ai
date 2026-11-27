import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "@/lib/storage/fake";
import { mockSb, UUID } from "./test-utils";
import {
  addPortfolioImage,
  addPortfolioVideo,
  deletePortfolioImage,
  deletePortfolioVideo,
  getPortfolio,
  reorderPortfolio,
  requestPortfolioUpload,
  updatePortfolioImage,
} from "./vendor-portfolio";

vi.mock("@/lib/storage", () => import("@/lib/storage/fake"));
beforeEach(() => fakeStorage.reset());

const ME = UUID;
const FILE = "9b2f0c1e-7d3a-4c55-9e1f-2a3b4c5d6e7f";
const OTHER = "223e4567-e89b-42d3-a456-426614174000";
const photo = { storagePath: `${ME}/${FILE}.webp`, thumbPath: `${ME}/${FILE}-thumb.webp`, width: 2400, height: 1600 };

/** mockSb plus the paths removed from storage (one entry per remove call). */
function withStorage(m: ReturnType<typeof mockSb>) {
  return {
    ...m,
    get removed() {
      return fakeStorage.calls.filter((c) => c.startsWith("remove:portfolio/")).map((c) => c.slice("remove:portfolio/".length).split(","));
    },
  };
}

describe("addPortfolioImage", () => {
  it("records the photo after the last one", async () => {
    const m = withStorage(mockSb({ vendor_portfolio_images: [{ data: { sort_order: 4 } }, { data: { id: OTHER } }] }));
    const r = await addPortfolioImage(m.sb, ME, { ...photo, caption: "  First dance " });
    expect(r).toEqual({ ok: true, data: { id: OTHER } });
    expect(m.called("vendor_portfolio_images", "insert")[0].args[0]).toMatchObject({
      vendor_id: ME,
      storage_path: photo.storagePath,
      thumb_path: photo.thumbPath,
      caption: "First dance",
      sort_order: 5,
    });
    expect(m.removed).toEqual([]);
  });

  it("refuses files outside the vendor's folder", async () => {
    const m = withStorage(mockSb());
    const r = await addPortfolioImage(m.sb, ME, { ...photo, storagePath: `${OTHER}/${FILE}.webp` });
    expect(r.ok).toBe(false);
    expect(m.calls).toEqual([]);
  });

  it("deletes the uploaded files and explains when the limit is hit", async () => {
    const m = withStorage(mockSb({ vendor_portfolio_images: [{ data: null }, { error: { message: "portfolio_limit:25" } }] }));
    const r = await addPortfolioImage(m.sb, ME, photo);
    expect(r).toEqual({ ok: false, error: "You can add up to 25 photos." });
    expect(m.removed).toEqual([[photo.storagePath, photo.thumbPath]]);
  });
});

describe("uploads", () => {
  const spec = { full: { contentType: "image/webp", bytes: 500_000 }, thumb: { contentType: "image/webp", bytes: 40_000 } };

  it("hands out two tickets in the vendor's own folder", async () => {
    const m = mockSb({ vendor_portfolio_images: { data: null, count: 3 } });
    const r = await requestPortfolioUpload(m.sb, ME, spec);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.storagePath).toMatch(new RegExp(`^${ME}/[0-9a-f-]{36}\\.webp$`));
    expect(r.data.thumbPath).toBe(r.data.storagePath.replace(".webp", "-thumb.webp"));
    expect(fakeStorage.calls).toEqual([`ticket:portfolio/${r.data.storagePath}`, `ticket:portfolio/${r.data.thumbPath}`]);
  });

  it("refuses when the portfolio is full, too big, or the wrong type", async () => {
    expect((await requestPortfolioUpload(mockSb({ vendor_portfolio_images: { data: null, count: 25 } }).sb, ME, spec)).ok).toBe(false);
    expect((await requestPortfolioUpload(mockSb().sb, ME, { ...spec, full: { contentType: "image/webp", bytes: 9_000_000 } })).ok).toBe(false);
    expect((await requestPortfolioUpload(mockSb().sb, ME, { ...spec, full: { contentType: "image/gif", bytes: 10 } })).ok).toBe(false);
    expect(fakeStorage.calls).toEqual([]);
  });

  it("won't record a photo whose file never arrived, and cleans up", async () => {
    fakeStorage.missing.add(photo.thumbPath);
    const m = withStorage(mockSb());
    const r = await addPortfolioImage(m.sb, ME, photo);
    expect(r.ok).toBe(false);
    expect(m.calls).toEqual([]);
    expect(m.removed).toEqual([[photo.storagePath, photo.thumbPath]]);
  });
});

describe("updatePortfolioImage", () => {
  it("clears the old cover before setting the new one", async () => {
    const m = mockSb({ vendor_portfolio_images: [{ data: null }, { data: { id: FILE } }] });
    expect((await updatePortfolioImage(m.sb, ME, { id: FILE, isCover: true })).ok).toBe(true);
    const updates = m.called("vendor_portfolio_images", "update").map((c) => c.args[0]);
    expect(updates).toEqual([{ is_cover: false }, { is_cover: true }]);
  });
  it("saves an emptied caption as null", async () => {
    const m = mockSb({ vendor_portfolio_images: { data: { id: FILE } } });
    await updatePortfolioImage(m.sb, ME, { id: FILE, caption: "  " });
    expect(m.called("vendor_portfolio_images", "update")[0].args[0]).toEqual({ caption: null });
  });
  it("fails for someone else's photo", async () => {
    const m = mockSb({ vendor_portfolio_images: { data: null } });
    expect((await updatePortfolioImage(m.sb, ME, { id: FILE, caption: "x" })).ok).toBe(false);
  });
});

describe("deletePortfolioImage", () => {
  it("removes the row and both files", async () => {
    const m = withStorage(mockSb({ vendor_portfolio_images: { data: { storage_path: "a.webp", thumb_path: "a-thumb.webp" } } }));
    expect((await deletePortfolioImage(m.sb, ME, { id: FILE })).ok).toBe(true);
    expect(m.removed).toEqual([["a.webp", "a-thumb.webp"]]);
  });
  it("leaves storage alone when nothing was deleted", async () => {
    const m = withStorage(mockSb({ vendor_portfolio_images: { data: null } }));
    expect((await deletePortfolioImage(m.sb, ME, { id: FILE })).ok).toBe(false);
    expect(m.removed).toEqual([]);
  });
});

describe("reorderPortfolio", () => {
  it("writes the new positions", async () => {
    const m = mockSb({ vendor_portfolio_images: { data: null } });
    expect((await reorderPortfolio(m.sb, ME, { kind: "image", ids: [OTHER, FILE] })).ok).toBe(true);
    expect(m.called("vendor_portfolio_images", "update").map((c) => c.args[0])).toEqual([{ sort_order: 0 }, { sort_order: 1 }]);
  });
  it("refuses duplicates and too many videos", async () => {
    const m = mockSb();
    expect((await reorderPortfolio(m.sb, ME, { kind: "image", ids: [FILE, FILE] })).ok).toBe(false);
    expect((await reorderPortfolio(m.sb, ME, { kind: "video", ids: [FILE, OTHER, ME, UUID.replace("1", "3")] })).ok).toBe(false);
  });
});

describe("addPortfolioVideo", () => {
  it("stores the parsed provider and id", async () => {
    const m = mockSb({ vendor_portfolio_videos: [{ data: null }, { data: { id: OTHER } }] });
    const r = await addPortfolioVideo(m.sb, ME, { url: "https://youtu.be/dQw4w9WgXcQ", title: "Highlight film" });
    expect(r).toEqual({ ok: true, data: { id: OTHER, provider: "youtube", videoId: "dQw4w9WgXcQ" } });
    expect(m.called("vendor_portfolio_videos", "insert")[0].args[0]).toMatchObject({ provider: "youtube", video_id: "dQw4w9WgXcQ", sort_order: 0 });
  });
  it("refuses other sites without touching the database", async () => {
    const m = mockSb();
    expect(await addPortfolioVideo(m.sb, ME, { url: "https://www.tiktok.com/@x/video/1" })).toEqual({
      ok: false,
      error: "Only YouTube and Vimeo links are supported.",
    });
    expect(m.calls).toEqual([]);
  });
  it("explains the 3-video limit", async () => {
    const m = mockSb({ vendor_portfolio_videos: [{ data: null }, { error: { message: "portfolio_limit:3" } }] });
    expect(await addPortfolioVideo(m.sb, ME, { url: "https://vimeo.com/76979871" })).toEqual({ ok: false, error: "You can add up to 3 videos." });
  });
});

describe("deletePortfolioVideo", () => {
  it("deletes the vendor's own video", async () => {
    const m = mockSb({ vendor_portfolio_videos: { data: { id: FILE } } });
    expect((await deletePortfolioVideo(m.sb, ME, { id: FILE })).ok).toBe(true);
  });
});

describe("getPortfolio", () => {
  it("puts the cover first", async () => {
    const m = mockSb({
      vendor_portfolio_images: {
        data: [
          { id: "a", is_cover: false },
          { id: "b", is_cover: true },
          { id: "c", is_cover: false },
        ],
      },
      vendor_portfolio_videos: { data: [] },
    });
    const p = await getPortfolio(m.sb, ME);
    expect(p.images.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
