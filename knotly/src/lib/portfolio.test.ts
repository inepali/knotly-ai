import { describe, expect, it } from "vitest";
import { embedUrl, fitBatch, fitWithin, isOwnPhotoPath, parseVideoUrl, photoAlt, portfolioError, portfolioUrl, toGallery, videoThumbUrl } from "./portfolio";

const ME = "123e4567-e89b-42d3-a456-426614174000";
const FILE = "9b2f0c1e-7d3a-4c55-9e1f-2a3b4c5d6e7f";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  https://youtu.be/dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
  ])("reads YouTube link %s", (url, id) => {
    expect(parseVideoUrl(url)).toEqual({ provider: "youtube", videoId: id });
  });

  it.each([
    ["https://vimeo.com/76979871", "76979871"],
    ["https://vimeo.com/channels/staffpicks/76979871", "76979871"],
    ["https://player.vimeo.com/video/76979871?h=abc", "76979871"],
  ])("reads Vimeo link %s", (url, id) => {
    expect(parseVideoUrl(url)).toEqual({ provider: "vimeo", videoId: id });
  });

  it.each([
    "not a url",
    "javascript:alert(1)",
    "https://www.instagram.com/reel/abc/",
    "https://www.tiktok.com/@x/video/123",
    "https://youtube.com/watch?v=short",
    "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
  ])("refuses %s", (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
});

describe("embedUrl / videoThumbUrl", () => {
  it("builds the iframe address from the id only", () => {
    expect(embedUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ" })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(embedUrl({ provider: "vimeo", videoId: "76979871" })).toBe("https://player.vimeo.com/video/76979871?autoplay=1");
  });
  it("has a still for YouTube only", () => {
    expect(videoThumbUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ" })).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(videoThumbUrl({ provider: "vimeo", videoId: "1" })).toBeNull();
  });
});

describe("isOwnPhotoPath", () => {
  it("accepts files in the vendor's own folder", () => {
    expect(isOwnPhotoPath(ME, `${ME}/${FILE}.webp`)).toBe(true);
    expect(isOwnPhotoPath(ME, `${ME}/${FILE}-thumb.webp`)).toBe(true);
    expect(isOwnPhotoPath(ME, `${ME}/${FILE}.jpg`)).toBe(true);
  });
  it("refuses other folders, odd names and path tricks", () => {
    expect(isOwnPhotoPath(ME, `${FILE}/${FILE}.webp`)).toBe(false);
    expect(isOwnPhotoPath(ME, `${ME}/../${FILE}.webp`)).toBe(false);
    expect(isOwnPhotoPath(ME, `${ME}/${FILE}.png`)).toBe(false);
    expect(isOwnPhotoPath(ME, `${ME}/nested/${FILE}.webp`)).toBe(false);
  });
});

describe("fitBatch", () => {
  it("uploads only what fits under 25", () => {
    expect(fitBatch(0, 10)).toEqual({ take: 10, skipped: 0 });
    expect(fitBatch(20, 10)).toEqual({ take: 5, skipped: 5 });
    expect(fitBatch(25, 3)).toEqual({ take: 0, skipped: 3 });
  });
});

describe("fitWithin", () => {
  it("caps the long edge and keeps the shape", () => {
    expect(fitWithin(6000, 4000, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(fitWithin(3000, 4500, 600)).toEqual({ width: 400, height: 600 });
    expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 }); // never enlarges
  });
});

describe("portfolioUrl", () => {
  it("points at the stable /media address", () => {
    expect(portfolioUrl("v/a b.webp")).toBe("/media/portfolio/v/a%20b.webp");
    expect(portfolioUrl(`${ME}/${FILE}.webp`, "https://knotly.net/")).toBe(
      `https://knotly.net/media/portfolio/${ME}/${FILE}.webp`
    );
  });
});

describe("photoAlt", () => {
  it("prefers the caption", () => {
    expect(photoAlt(" First dance at Duke Mansion ", { business: "Golden Hour", kind: "Photographer", n: 1 })).toBe("First dance at Duke Mansion");
  });
  it("falls back to business, kind, number and place", () => {
    expect(photoAlt(null, { business: "Golden Hour", kind: "Photographer", n: 3, place: "Charlotte, NC" })).toBe(
      "Golden Hour photographer photo 3, Charlotte, NC"
    );
  });
});

describe("portfolioError", () => {
  it("explains the database limits", () => {
    expect(portfolioError("portfolio_limit:25")).toBe("You can add up to 25 photos.");
    expect(portfolioError("portfolio_limit:3")).toBe("You can add up to 3 videos.");
    expect(portfolioError('duplicate key value violates unique constraint "vendor_portfolio_videos_vendor_id_provider_video_id_key"')).toBe(
      "That video is already in your portfolio."
    );
  });
});

describe("toGallery", () => {
  it("builds public URLs, numbered alt text and video ids", () => {
    const g = toGallery(
      {
        images: [
          { storage_path: "v/a.webp", thumb_path: "v/a-thumb.webp", caption: null, width: 2400, height: 1600 },
          { storage_path: "v/b.webp", thumb_path: "v/b-thumb.webp", caption: "Toast", width: null, height: null },
        ],
        videos: [{ id: "x", provider: "youtube", video_id: "dQw4w9WgXcQ", title: null }],
      },
      { business: "Golden Hour", kind: "Photographer", place: "Charlotte, NC" },
      "https://knotly.net"
    );
    expect(g.photos[0].thumb).toBe("https://knotly.net/media/portfolio/v/a-thumb.webp");
    expect(g.photos.map((p) => p.alt)).toEqual(["Golden Hour photographer photo 1, Charlotte, NC", "Toast"]);
    expect(g.videos).toEqual([{ id: "x", provider: "youtube", videoId: "dQw4w9WgXcQ", title: null }]);
  });
});
