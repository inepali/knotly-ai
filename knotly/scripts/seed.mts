// scripts/seed.mts  (.mts = ES module, so top-level await works)
// Demo data for the DEV project: test vendors with no-haggle packages + deliverables and
// knowledge-base FAQs, and one test couple. Safe to re-run: existing accounts are updated,
// not duplicated. Message and checklist templates are reference data in the migrations.
import { createClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
const model = openai.textEmbeddingModel("text-embedding-3-small");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Deliverable = { item: string; qty: string | null; delivery: string | null };
type Seed = {
  email: string;
  name: string;
  category: string;
  bio: string;
  lat: number;
  lng: number;
  metro?: string;
  packages: {
    name: string;
    price: number;
    hours: number | null;
    retainer: number;
    inclusions: string[];
    deliverables: Deliverable[];
  }[];
  faqs: { q: string; a: string }[];
};

const d = (item: string, qty: string | null = null, delivery: string | null = null): Deliverable => ({
  item,
  qty,
  delivery,
});

const vendors: Seed[] = [
  {
    email: "goldenhour@test.dev",
    name: "Golden Hour Co.",
    category: "photographer",
    bio: "Candid, documentary wedding photography with a warm film look. Lots of golden-hour portraits.",
    lat: 35.22,
    lng: -80.84,
    packages: [
      {
        name: "Essential",
        price: 3200,
        hours: 6,
        retainer: 1000,
        inclusions: ["6 hours", "online gallery"],
        deliverables: [d("Edited photos", "400+", "6 weeks"), d("Online gallery", "1", "6 weeks")],
      },
      {
        name: "Signature",
        price: 4800,
        hours: 8,
        retainer: 1500,
        inclusions: ["8 hours", "second shooter", "engagement session"],
        deliverables: [
          d("Edited photos", "600+", "6 weeks"),
          d("Second shooter", "1"),
          d("Engagement session", "1", "3 weeks after the session"),
          d("Online gallery", "1", "6 weeks"),
        ],
      },
    ],
    faqs: [
      { q: "Do you travel outside Charlotte?", a: "Yes! Travel within 75 miles of Charlotte is included. Beyond that we add travel at cost." },
      { q: "When will we get our photos?", a: "Your full gallery is delivered within 6 weeks, with a sneak peek of 30 photos within a week." },
      { q: "Do you shoot film?", a: "We shoot digital and edit for a warm film look. A roll of 35mm film can be added on request." },
    ],
  },
  {
    email: "moody@test.dev",
    name: "Ink & Ivory Studio",
    category: "photographer",
    bio: "Moody, editorial, dark-and-dramatic wedding photography for bold couples.",
    lat: 35.1,
    lng: -80.7,
    packages: [
      {
        name: "Full Day",
        price: 5600,
        hours: 10,
        retainer: 2000,
        inclusions: ["10 hours", "album", "second shooter"],
        deliverables: [d("Edited photos", "700+", "8 weeks"), d("Heirloom album", "1", "12 weeks"), d("Second shooter", "1")],
      },
    ],
    faqs: [
      { q: "Can we get the raw files?", a: "We don't release raw files; every delivered image is fully edited in our style." },
    ],
  },
  {
    email: "beats@test.dev",
    name: "Queen City Beats",
    category: "dj",
    bio: "High-energy DJ and MC. Bilingual announcements, uplighting, packed dance floors.",
    lat: 35.23,
    lng: -80.85,
    packages: [
      {
        name: "Party",
        price: 1600,
        hours: 5,
        retainer: 500,
        inclusions: ["5 hours", "MC", "uplighting"],
        deliverables: [d("DJ + MC", "5 hours"), d("Uplighting", "12 lights"), d("Planning call", "1", "4 weeks before")],
      },
    ],
    faqs: [
      { q: "Do you take song requests?", a: "Absolutely. Send your must-play and do-not-play lists in the planning form, and guests can request on the night." },
      { q: "Can you do announcements in Spanish?", a: "Yes, all announcements can be bilingual in English and Spanish." },
    ],
  },
  {
    email: "bloom@test.dev",
    name: "Wild Bloom Florals",
    category: "florist",
    bio: "Garden-style, boho, seasonal florals with lots of greenery. Sustainable and foam-free.",
    lat: 35.3,
    lng: -80.75,
    packages: [
      {
        name: "Ceremony + Reception",
        price: 3500,
        hours: null,
        retainer: 1000,
        inclusions: ["bridal bouquet", "10 centerpieces", "arch"],
        deliverables: [d("Bridal bouquet", "1"), d("Centerpieces", "10"), d("Ceremony arch install", "1"), d("Setup and teardown", "1")],
      },
    ],
    faqs: [
      { q: "Do you use floral foam?", a: "No. We're foam-free and use reusable mechanics and compostable materials." },
    ],
  },
  {
    email: "barn@test.dev",
    name: "Catawba Barn",
    category: "venue",
    bio: "Rustic barn venue on 40 acres with an outdoor ceremony lawn. Up to 220 guests.",
    lat: 35.05,
    lng: -81.0,
    packages: [
      {
        name: "Saturday",
        price: 9000,
        hours: 12,
        retainer: 3000,
        inclusions: ["12 hours", "tables and chairs", "bridal suite"],
        deliverables: [d("Venue access", "12 hours"), d("Tables and chairs", "up to 220 guests"), d("Bridal suite", "1")],
      },
    ],
    faqs: [
      { q: "What is your guest capacity?", a: "Up to 220 guests seated in the barn, and 250 for the outdoor ceremony." },
      { q: "Is there a rain plan?", a: "Yes, the ceremony moves into the barn and we flip the room during cocktail hour." },
    ],
  },
  {
    email: "triangle@test.dev",
    name: "Oak City Photo",
    category: "photographer",
    bio: "Bright and airy, classic wedding photography.",
    lat: 35.78,
    lng: -78.64,
    metro: "raleigh-nc",
    packages: [
      {
        name: "Classic",
        price: 2900,
        hours: 6,
        retainer: 900,
        inclusions: ["6 hours"],
        deliverables: [d("Edited photos", "400+", "6 weeks")],
      },
    ],
    faqs: [],
  },
];

async function userIdFor(email: string, role: "couple" | "vendor"): Promise<{ id: string; created: boolean }> {
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role } });
  if (!error) return { id: data.user.id, created: true };
  const { data: p } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) throw new Error(`${email}: ${error.message}`);
  return { id: p.id, created: false };
}

async function tryEmbed(value: string) {
  try {
    return (await embed({ model, value })).embedding;
  } catch (e) {
    console.warn("  (no embedding:", e instanceof Error ? e.message : e, ")");
    return null;
  }
}

for (const v of vendors) {
  const { id, created } = await userIdFor(v.email, "vendor");
  const prices = v.packages.map((p) => p.price);

  if (created) {
    const { error } = await sb.from("vendors").insert({
      id,
      business_name: v.name,
      category: v.category,
      bio: v.bio,
      metro_slug: v.metro ?? "charlotte-nc",
      location: `SRID=4326;POINT(${v.lng} ${v.lat})`,
      price_min: Math.min(...prices),
      price_max: Math.max(...prices),
      published: true,
    });
    if (error) throw new Error(`${v.name}: ${error.message}`);
    await sb.from("testimonials").insert({
      vendor_id: id,
      author_name: "Kayla M.",
      rating: 5,
      body: `${v.name} made our day so easy. Highly recommend!`,
    });
  }

  // Packages: update by name (bookings may point at them), insert the missing ones.
  const { data: existing } = await sb.from("vendor_packages").select("id, name").eq("vendor_id", id);
  for (const [i, p] of v.packages.entries()) {
    const row = {
      vendor_id: id,
      name: p.name,
      price: p.price,
      hours: p.hours,
      retainer_amount: p.retainer,
      inclusions: p.inclusions,
      deliverables: p.deliverables,
      active: true,
      sort: i,
    };
    const match = existing?.find((e) => e.name === p.name);
    const { error } = match
      ? await sb.from("vendor_packages").update(row).eq("id", match.id)
      : await sb.from("vendor_packages").insert(row);
    if (error) throw new Error(`${v.name} / ${p.name}: ${error.message}`);
  }

  // Knowledge-base FAQs, stored the way src/lib/knowledge.ts ingests them.
  const { data: haveFaqs } = await sb.from("vendor_knowledge").select("question").eq("vendor_id", id).eq("kind", "faq");
  const newFaqs = v.faqs.filter((f) => !haveFaqs?.some((h) => h.question === f.q));
  if (newFaqs.length) {
    const pieces = newFaqs.map((f) => `[${f.q}]\nQ: ${f.q}\nA: ${f.a}`);
    let embeddings: number[][] | null = null;
    try {
      embeddings = (await embedMany({ model, values: pieces })).embeddings;
    } catch (e) {
      console.warn("  (FAQs saved without search pieces:", e instanceof Error ? e.message : e, ")");
    }
    for (const [i, f] of newFaqs.entries()) {
      const text = `Q: ${f.q}\nA: ${f.a}`;
      const { data: src, error } = await sb
        .from("vendor_knowledge")
        .insert({
          vendor_id: id,
          kind: "faq",
          title: f.q,
          question: f.q,
          answer: f.a,
          status: embeddings ? "ready" : "pending",
          chars: text.length,
        })
        .select("id")
        .single();
      if (error) throw new Error(`${v.name} FAQ: ${error.message}`);
      if (embeddings) {
        await sb.from("vendor_knowledge_chunks").insert({
          source_id: src.id,
          vendor_id: id,
          content: pieces[i],
          embedding: embeddings[i],
        });
      }
    }
  }

  // Search embedding (same profile document as src/lib/embeddings.ts, simplified).
  const doc =
    `${v.name}: ${v.category}. ${v.bio} ` +
    v.packages.map((p) => `${p.name} $${p.price}: ${p.deliverables.map((x) => x.item).join(", ")}`).join(". ");
  const embedding = await tryEmbed(doc);
  if (embedding) await sb.from("vendors").update({ embedding }).eq("id", id);

  console.log(created ? "✓" : "↻", v.name);
}

// One test couple with a saved wedding and a few needs (no checklist/budget: the app seeds
// those when a couple saves their wedding).
{
  const { id, created } = await userIdFor("couple@test.dev", "couple");
  const { data: project } = await sb.from("couple_projects").select("id").eq("couple_id", id).maybeSingle();
  if (!project) {
    const { data: p, error } = await sb
      .from("couple_projects")
      .insert({
        couple_id: id,
        partner_names: "Priya & Sam",
        wedding_date: "2027-10-16",
        metro_slug: "charlotte-nc",
        venue: "Catawba Barn",
        guest_count: 150,
        budget_total: 40000,
        style: "boho, outdoor, golden hour",
      })
      .select("id")
      .single();
    if (error) throw new Error(`couple project: ${error.message}`);
    await sb.from("needs").insert(
      [
        { category: "photographer", budget: 5000, priority: 1 },
        { category: "dj", budget: 2000, priority: 2 },
        { category: "florist", budget: 3500, priority: 2 },
      ].map((n) => ({ ...n, project_id: p.id }))
    );
  }
  console.log(created ? "✓" : "↻", "couple@test.dev");
}
