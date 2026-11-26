// scripts/seed-test-users.mts — test accounts for trying the app by hand.
//   pnpm seed:users
// Creates customer1..3@knotly.net (couples) and vendor1..6@knotly.net (published vendors), all with
// the same password. Safe to run again: existing accounts get the password reset and their rows
// refreshed. Needs no OpenAI key (vendor "embedding" is left empty; add it later by re-reading Knowledge).
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "Knotly#Test2026";
const TERMS_VERSION = "2026-09";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const couples = [
  {
    email: "customer1@knotly.net",
    name: "Emma Carter",
    partners: "Emma & Jake",
    metro: "charlotte-nc",
    date: "2027-06-12",
    venue: "Catawba Barn",
    guests: 140,
    budget: 32000,
    style: "boho, outdoor, golden hour",
    needs: ["photographer", "videographer", "dj", "florist"],
    story: "We met at a friend's cookout in 2021 and have been inseparable since.",
  },
  {
    email: "customer2@knotly.net",
    name: "Priya Patel",
    partners: "Priya & Arjun",
    metro: "raleigh-nc",
    date: "2027-09-18",
    venue: "The Mordecai Estate",
    guests: 220,
    budget: 55000,
    style: "classic, elegant, indian fusion",
    needs: ["photographer", "caterer", "dj", "makeup_artist"],
    story: "Two families, one big celebration. We want colour, music and a long dance floor.",
  },
  {
    email: "customer3@knotly.net",
    name: "Olivia Nguyen",
    partners: "Olivia & Sam",
    metro: "greenville-sc",
    date: "2027-04-24",
    venue: "Falls Park",
    guests: 70,
    budget: 20000,
    style: "intimate, modern, minimal",
    needs: ["photographer", "florist", "wedding_officiant"],
    story: "A small ceremony with the people who matter most.",
  },
];

type V = {
  email: string;
  name: string;
  category: string;
  bio: string;
  metro: string;
  lat: number;
  lng: number;
  packages: { name: string; price: number; inclusions: string[] }[];
};

const vendors: V[] = [
  {
    email: "vendor1@knotly.net",
    name: "Golden Hour Photography",
    category: "photographer",
    bio: "Candid, documentary wedding photography with a warm film look and lots of golden-hour portraits.",
    metro: "charlotte-nc",
    lat: 35.22,
    lng: -80.84,
    packages: [
      { name: "Essential", price: 3200, inclusions: ["6 hours", "online gallery"] },
      { name: "Signature", price: 4800, inclusions: ["8 hours", "second shooter", "engagement session"] },
    ],
  },
  {
    email: "vendor2@knotly.net",
    name: "Ink & Ivory Films",
    category: "videographer",
    bio: "Cinematic wedding films: highlight reel, full ceremony and speeches, delivered in 6 weeks.",
    metro: "charlotte-nc",
    lat: 35.1,
    lng: -80.7,
    packages: [
      { name: "Highlight", price: 2400, inclusions: ["6 hours", "3-minute highlight film"] },
      { name: "Full Story", price: 4200, inclusions: ["10 hours", "highlight film", "full ceremony edit"] },
    ],
  },
  {
    email: "vendor3@knotly.net",
    name: "Queen City Beats",
    category: "dj",
    bio: "High-energy DJ and MC. Bilingual announcements, uplighting and packed dance floors.",
    metro: "charlotte-nc",
    lat: 35.23,
    lng: -80.85,
    packages: [{ name: "Party", price: 1600, inclusions: ["5 hours", "MC", "uplighting"] }],
  },
  {
    email: "vendor4@knotly.net",
    name: "Wild Bloom Florals",
    category: "florist",
    bio: "Garden-style, boho, seasonal florals with lots of greenery. Sustainable and foam-free.",
    metro: "raleigh-nc",
    lat: 35.78,
    lng: -78.64,
    packages: [
      { name: "Ceremony + Reception", price: 3500, inclusions: ["bridal bouquet", "10 centerpieces", "arch"] },
    ],
  },
  {
    email: "vendor5@knotly.net",
    name: "Magnolia Table Catering",
    category: "caterer",
    bio: "Southern-inspired plated and family-style menus. Vegetarian and halal options on request.",
    metro: "raleigh-nc",
    lat: 35.8,
    lng: -78.6,
    packages: [
      { name: "Plated Dinner", price: 85, inclusions: ["per guest", "three courses", "service staff"] },
      { name: "Family Style", price: 70, inclusions: ["per guest", "two entrees", "three sides"] },
    ],
  },
  {
    email: "vendor6@knotly.net",
    name: "Greenville Glam Studio",
    category: "makeup_artist",
    bio: "Bridal hair and makeup on location. Trials included, touch-ups all day.",
    metro: "greenville-sc",
    lat: 34.85,
    lng: -82.39,
    packages: [
      { name: "Bride", price: 350, inclusions: ["trial", "wedding-day makeup", "lashes"] },
      { name: "Bridal Party", price: 900, inclusions: ["bride + 4", "trial for bride"] },
    ],
  },
];

// Find or create an auth user (profile row is made by the handle_new_user trigger).
const existing = new Map<string, string>();
{
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email) existing.set(u.email.toLowerCase(), u.id);
}

async function account(email: string, role: "couple" | "vendor", fullName: string) {
  let id = existing.get(email);
  if (id) {
    await sb.auth.admin.updateUserById(id, { password: PASSWORD, email_confirm: true });
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role },
    });
    if (error || !data.user) throw new Error(`${email}: ${error?.message}`);
    id = data.user.id;
  }
  const { error } = await sb
    .from("profiles")
    .update({
      role,
      full_name: fullName,
      email,
      is_guest: false,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`${email} profile: ${error.message}`);
  return id;
}

for (const c of couples) {
  const id = await account(c.email, "couple", c.name);
  const row = {
    couple_id: id,
    partner_names: c.partners,
    wedding_date: c.date,
    metro_slug: c.metro,
    venue: c.venue,
    guest_count: c.guests,
    budget_total: c.budget,
    style: c.style,
    love_story: c.story,
    needs: c.needs,
  };
  const { data: found } = await sb.from("couple_projects").select("id").eq("couple_id", id).maybeSingle();
  const res = found
    ? await sb.from("couple_projects").update(row).eq("id", found.id).select("id").single()
    : await sb.from("couple_projects").insert(row).select("id").single();
  if (res.error) throw new Error(`${c.email} project: ${res.error.message}`);
  const projectId = res.data.id;
  const { error } = await sb
    .from("project_needs")
    .upsert(c.needs.map((category) => ({ project_id: projectId, category })), { onConflict: "project_id,category" });
  if (error) throw new Error(`${c.email} needs: ${error.message}`);
  console.log("✓ couple", c.email, `(${c.partners})`);
}

for (const v of vendors) {
  const id = await account(v.email, "vendor", v.name);
  const prices = v.packages.map((p) => p.price);
  const { error } = await sb.from("vendors").upsert({
    id,
    business_name: v.name,
    category: v.category,
    bio: v.bio,
    metro_slug: v.metro,
    location: `SRID=4326;POINT(${v.lng} ${v.lat})`,
    price_min: Math.min(...prices),
    price_max: Math.max(...prices),
    published: true,
  });
  if (error) throw new Error(`${v.email} vendor: ${error.message}`);

  await sb.from("vendor_packages").delete().eq("vendor_id", id);
  await sb.from("vendor_packages").insert(v.packages.map((p) => ({ ...p, vendor_id: id })));
  await sb.from("testimonials").delete().eq("vendor_id", id);
  await sb.from("testimonials").insert({
    vendor_id: id,
    author_name: "Kayla M.",
    rating: 5,
    body: `${v.name} made our day so easy. Highly recommend!`,
  });
  console.log("✓ vendor", v.email, `(${v.name}, ${v.category})`);
}

console.log(`\nDone. Sign in at /signin with any of these emails and password: ${PASSWORD}`);
