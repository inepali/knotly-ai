# Vendor Portfolio Spec

## Overview

A **Portfolio** page in the vendor dashboard where a vendor shows their work: **up to 25 photos** and **up to 3 video links** (YouTube or Vimeo). The portfolio shows in three places:

| Where | Who sees it |
|---|---|
| Public vendor page `/wedding-vendors/[city]/[category]/[slug]` | Anyone, including search engines. Only for public vendors: monthly/yearly plans once billing ships (see `seo-listing-pages-spec.md`) |
| Couple-only vendor page `/vendors/[id]` | Couples who received the vendor's estimate, on every plan, pay-per-use included |
| Listing cards on `/wedding-vendors/[city]/[category]` | The cover photo, for public vendors |

It follows the form-first pattern: a dashboard page backed by shared server functions in `src/lib/actions`, no chat tools, no AI.

## Navigation

"Portfolio" sits right after Business in the vendor sidebar (`VendorShell` links), at `/vendor/dashboard/portfolio`. Every vendor sees it, whatever their plan.

## Data model

Migration `20261126130000_vendor_portfolio.sql`:

- `vendor_portfolio_images`: `storage_path` (full photo), `thumb_path` (600px thumbnail), `caption` (≤ 200), `sort_order`, `is_cover`, `width`, `height`. A unique partial index allows one cover per vendor.
- `vendor_portfolio_videos`: `provider` (`youtube` | `vimeo`), `video_id` (parsed, format-checked), `url` (as pasted), `title` (≤ 120), `sort_order`. Unique on `(vendor_id, provider, video_id)`.
- **Limits in the database:** a `BEFORE INSERT` trigger allows 25 photos and 3 videos per vendor. It takes a per-vendor advisory lock before counting, so parallel uploads can't both slip in as #26. It raises `portfolio_limit:N`, which `portfolioError()` turns into words. The same limits live in `src/lib/portfolio.ts` (`MAX_IMAGES`, `MAX_VIDEOS`).
- **RLS:** the vendor reads and writes their own rows. Anyone can read a published vendor's rows (same rule as packages). Which vendors get a *public page* is decided by the page itself (`isPublicVendor`), not by RLS.
- `list_public_vendors()` gains `cover_thumb_path` (the cover, else the first photo) for listing cards.

## Storage

- **Public** bucket `vendor-portfolio` (3 MB per file, WebP/JPEG only). Paths are `{vendor_id}/{uuid}.webp` and `{vendor_id}/{uuid}-thumb.webp`.
- The bucket is public because these are marketing photos. Public URLs are CDN-cached and indexable by Google Images (signed URLs expire). The random UUIDs mean a pay-per-use vendor's photos can't be found without a link, which is acceptable.
- Storage policies: a vendor can write and delete only under their own `{vendor_id}/` folder.
- **The browser does the resizing:** it reads the photo (JPEG, PNG, WebP, or HEIC where the browser can decode it; ≤ 10 MB), then encodes a 2400px full image (q 0.82) and a 600px thumbnail (q 0.78) as WebP, falling back to JPEG where WebP encoding isn't supported.
- We store our own thumbnail instead of using Supabase image transformations, which are a paid add-on.
- **Upload flow:** the browser uploads both files straight to Storage (they're too big for a server action's 1 MB body limit), then calls `addPortfolioImage`.
  - The server checks both paths are in the vendor's own folder.
  - If the insert fails (e.g. the 25-photo limit), it deletes both files.
- Deleting a photo deletes the row, then both files.

## Server functions

`src/lib/actions/vendor-portfolio.ts`. Each is `(sb, userId, input)` → `{ ok, data | error }`, validated with Zod, and called through server actions in `src/app/vendor/dashboard/actions.ts`.

- `getPortfolio(sb, vendorId)`: photos (cover first, then `sort_order`) and videos
- `addPortfolioImage({ storagePath, thumbPath, caption?, width, height })`
- `updatePortfolioImage({ id, caption?, isCover? })`: setting a cover clears the old one first
- `deletePortfolioImage({ id })`
- `reorderPortfolio({ kind, ids })`: rejects duplicates, more than 3 videos, or more than 25 photos
- `addPortfolioVideo({ url, title? })`: only YouTube/Vimeo, parsed by `parseVideoUrl`
- `deletePortfolioVideo({ id })`

**Video links:** YouTube `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`; Vimeo `vimeo.com/{id}` (including channel paths) and `player.vimeo.com/video/{id}`. Anything else is refused, and so are lookalike hosts. Embeds are built only from `provider` + `video_id` (`youtube-nocookie.com`, `player.vimeo.com`); pasted HTML is never stored or rendered.

## Dashboard page

- **Status banner**, one of:
  - "Your public page is live → View page"
  - "Publish on the Business page"
  - "Add your city"
  - "Subscription ended, renew"
  - pay-per-use: "Couples who get your estimate see this; upgrade for a public page on Google"
- **Photos (n/25):**
  - Drag-and-drop or "Choose photos" (multi-select, camera roll on phones).
  - A batch that would go past 25 uploads only what fits and says how many were skipped.
  - Each file shows its status: waiting, uploading, added, or the error.
- **Each photo:** a thumbnail, a caption (saves when you leave the box), ← → to reorder, Make cover, and Delete (with confirm). A chosen cover stays pinned first. With no cover chosen, the first photo is the cover.
- **Videos (n/3):** link + optional title. The Add button turns on only for a valid link. Each video shows a still (YouTube), ↑ ↓ to reorder, and remove. The form hides at 3.
- Empty state: "Couples decide faster when they see your work. Add at least 6 photos."

## Gallery (public and couple pages)

`PortfolioGallery`:

- **Cover:** shown big (eager, high fetch priority), then a grid of lazy-loaded thumbnails.
- **Full-screen viewer:** tap a photo to open it. Navigate with swipe, arrow keys or ‹ ›; Esc closes. Captions show in the viewer.
- **Videos:** click-to-play thumbnails. The iframe loads only on click.
- **Alt text:** the caption, else "{Business} {category} photo {n}, {City, ST}".
- Rendered on the server too, so crawlers get every `<img>` and its alt text.

**SEO on the public page:**

- JSON-LD `LocalBusiness.image` lists up to 10 photo URLs.
- Open Graph/Twitter use the cover photo, with a `summary_large_image` card when there is one.

## Tests

- `src/lib/portfolio.test.ts`: video URL parsing (accepts/refuses), embeds, stills, own-path check, batch fitting, resize math, public URLs, alt text, error messages, gallery mapping
- `src/lib/actions/vendor-portfolio.test.ts`: insert ordering, foreign paths refused, file cleanup on limit, cover swap, caption clearing, delete removes files, reorder rules, video add/limit/refuse
- `src/lib/vendor-seo.test.ts`: `image` only when there are photos

## Not in this pass

- **Drag-to-reorder:** reordering uses ← → buttons for now, which also work on phones and with a keyboard.
- **Cleaning up files when a vendor account is deleted:** rows cascade, but the storage files stay. Add a cleanup when account deletion is built.
- **Portfolio highlights on estimate cards** (the cover flag makes this easy later).

## Open questions

1. **Grace period when a subscription lapses:** default is off at the end of the paid period. 3–7 days to match Stripe's retries is recommended.
2. **Are monthly/yearly the same as "Pro"** for estimate-wave weighting? Assumed yes.
3. **Other video hosts** (Instagram, TikTok, Google Drive)? Default is YouTube and Vimeo only.

## References

- `seo-listing-pages-spec.md`: the public-vendor rule (`listed_until`, `PUBLIC_PAGES_REQUIRE_PLAN`), listing cards
- `form-first-migration-spec.md`: vendor routes, shared server functions
