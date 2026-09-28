// scripts/seed.mts  (.mts = ES module, so top-level await works)
import { createClient } from "@supabase/supabase-js";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
const model = openai.textEmbeddingModel("text-embedding-3-small");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Seed = {
  email: string;
  name: string;
  category: string;
  bio: string;
  lat: number;
  lng: number;
  metro?: string;
  packages: { name: string; price: number; inclusions: string[] }[];
};

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
        inclusions: ["6 hours", "online gallery"],
      },
      {
        name: "Signature",
        price: 4800,
        inclusions: ["8 hours", "second shooter", "engagement session"],
      },
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
        inclusions: ["10 hours", "album", "second shooter"],
      },
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
        inclusions: ["5 hours", "MC", "uplighting"],
      },
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
        inclusions: ["bridal bouquet", "10 centerpieces", "arch"],
      },
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
        inclusions: ["12 hours", "tables and chairs", "bridal suite"],
      },
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
    packages: [{ name: "Classic", price: 2900, inclusions: ["6 hours"] }],
  },
];

for (const v of vendors) {
  const { data, error } = await sb.auth.admin.createUser({
    email: v.email,
    email_confirm: true,
    user_metadata: { role: "vendor" },
  });
  if (error) {
    console.error(v.email, error.message);
    continue;
  }
  const id = data.user.id;
  const prices = v.packages.map((p) => p.price);

  await sb.from("vendors").insert({
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
  await sb
    .from("vendor_packages")
    .insert(v.packages.map((p) => ({ ...p, vendor_id: id })));
  await sb.from("testimonials").insert([
    {
      vendor_id: id,
      author_name: "Kayla M.",
      rating: 5,
      body: `${v.name} made our day so easy. Highly recommend!`,
    },
  ]);

  // inside the loop, after inserting testimonials:
  const doc =
    `${v.name}: ${v.category}. ${v.bio} ` +
    v.packages
      .map((p) => `${p.name} $${p.price}: ${p.inclusions.join(", ")}`)
      .join(". ");
  const { embedding } = await embed({ model, value: doc });
  await sb.from("vendors").update({ embedding }).eq("id", id);

  console.log("✓", v.name);
}
