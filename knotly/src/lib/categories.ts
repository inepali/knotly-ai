// src/lib/categories.ts — the vendor categories Knotly supports, in display order.
// Mirrors the vendor_categories table (see the vendor_categories migration); when you
// add one, add it in both places.
export const VENDOR_CATEGORIES = [
  { slug: "wedding_planner", name: "Wedding Planner", group: "Planning" },
  { slug: "day_of_coordinator", name: "Day-of Coordinator", group: "Planning" },
  { slug: "stylist", name: "Stylist", group: "Planning" },
  { slug: "venue", name: "Venue", group: "Venue & food" },
  { slug: "caterer", name: "Caterer", group: "Venue & food" },
  { slug: "bartending", name: "Bartending", group: "Venue & food" },
  { slug: "baker", name: "Baker", group: "Venue & food" },
  { slug: "dessert", name: "Dessert", group: "Venue & food" },
  { slug: "photographer", name: "Photographer", group: "Photo & video" },
  { slug: "videographer", name: "Videographer", group: "Photo & video" },
  { slug: "content_creator", name: "Content Creator", group: "Photo & video" },
  { slug: "photo_booth", name: "Photo Booth", group: "Photo & video" },
  { slug: "dj", name: "DJ", group: "Music & entertainment" },
  { slug: "mc", name: "Master of Ceremonies", group: "Music & entertainment" },
  { slug: "live_band", name: "Live Band", group: "Music & entertainment" },
  { slug: "ceremony_musicians", name: "Ceremony / Cocktail Musicians", group: "Music & entertainment" },
  { slug: "live_entertainer", name: "Live Entertainer", group: "Music & entertainment" },
  { slug: "florist", name: "Florist", group: "Decor & rentals" },
  { slug: "event_rental", name: "Event Rental", group: "Decor & rentals" },
  { slug: "tent_rental", name: "Tent Rental", group: "Decor & rentals" },
  { slug: "bridal_boutique", name: "Bridal Boutique", group: "Attire & beauty" },
  { slug: "tuxedo_rental", name: "Tuxedo Rental", group: "Attire & beauty" },
  { slug: "seamstress", name: "Seamstress", group: "Attire & beauty" },
  { slug: "hair_stylist", name: "Hair Stylist", group: "Attire & beauty" },
  { slug: "makeup_artist", name: "Makeup Artist", group: "Attire & beauty" },
  { slug: "calligrapher", name: "Calligrapher", group: "Stationery & keepsakes" },
  { slug: "transportation", name: "Transportation", group: "Guest services" },
  { slug: "wedding_officiant", name: "Wedding Officiant", group: "Ceremony" },
  { slug: "jeweler", name: "Jeweler", group: "Attire & beauty" },
  { slug: "valet_parking", name: "Valet Parking", group: "Guest services" },
  { slug: "security", name: "Security Service", group: "Guest services" },
  { slug: "audio_guestbook", name: "Audio Guestbook", group: "Stationery & keepsakes" },
  { slug: "live_painter", name: "Live Painter", group: "Music & entertainment" },
] as const;

export type CategorySlug = (typeof VENDOR_CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS = VENDOR_CATEGORIES.map((c) => c.slug) as unknown as [CategorySlug, ...CategorySlug[]];

const NAMES = new Map<string, string>(VENDOR_CATEGORIES.map((c) => [c.slug, c.name]));

// "wedding_planner" → "Wedding Planner"; unknown values (e.g. a budget "other") are tidied up.
export function categoryLabel(slug: string) {
  return NAMES.get(slug) ?? slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
