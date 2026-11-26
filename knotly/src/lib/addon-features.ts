// src/lib/addon-features.ts — the "What you get" list on each add-on's preview page.
import type { AddonKey } from "./addons";

export const ADDON_FEATURES: Record<AddonKey, string[]> = {
  website: [
    "A one-page site at knotly.net/w/your-names",
    "Our story, schedule, travel and stay, wedding party, FAQ",
    "Pick a theme; add up to 10 photos",
    "Optional password; hidden from search engines unless you turn it on",
  ],
  rsvp: [
    "Guests RSVP on your website, per person and per event",
    "Meal choices, dietary notes, plus-ones, song requests",
    "Personal RSVP links for each household",
    "Live counts, a no-response list, reminder emails and CSV export",
  ],
  registry: [
    "Links to your store registries (Amazon, Target, Zola…)",
    "Cash and honeymoon funds that link to Venmo, Zelle, PayPal or Honeyfund",
    "Up to 50 wish items guests can mark as claimed",
    "Gifts go straight to you. Knotly never handles the money.",
  ],
  invitations: [
    "Save-the-date and invitation templates in your website's colors",
    "Email each household with their personal RSVP link",
    "See who got it and who opened it",
    "Printable 5×7 PDF with a QR code",
  ],
  seating: [
    "Add round or long tables with seat counts",
    "Drag guests from your list, with warnings for full tables",
    "Uses RSVP answers when you have RSVP",
    "Printable seating plan and escort-card list",
  ],
  photo_share: [
    "A QR code and short link guests scan at the venue",
    "Guests upload without an account",
    "Approve photos first, or show them right away",
    "Up to 1,000 photos; download everything as a zip",
  ],
  thank_you: [
    "A gift log for each household",
    "Mark thank-you notes as sent and filter who's left",
    "Pulls in gifts from your registry",
    "Printable address labels and CSV",
  ],
};
