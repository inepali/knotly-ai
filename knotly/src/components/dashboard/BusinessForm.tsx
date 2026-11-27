// src/components/dashboard/BusinessForm.tsx — the vendor's Business page: profile, publish, reviews.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, labelClasses, panelClasses } from "@/components/ui/fields";
import { VENDOR_CATEGORIES } from "@/lib/categories";
import { deleteReviewAction, publishAction, saveBusinessAction } from "@/app/vendor/dashboard/actions";
import { useAction } from "./useAction";
import ReviewRequests, { type Client, type SentRequest } from "./ReviewRequests";
import { reviewBadge } from "@/lib/review-requests";

type Review = { id: string; author_name: string; rating: number | null; body: string; verified: boolean; source?: string | null };
type Vendor = {
  businessName: string;
  category: string;
  bio: string;
  metro: string;
  website: string;
  published: boolean;
  packageCount: number;
  reviews: Review[];
  clients: Client[];
  reviewRequests: SentRequest[];
};
type Metro = { slug: string; name: string; state: string };

export default function BusinessForm({
  vendor,
  metros,
  publicPath,
  publicUrl,
}: {
  vendor: Vendor | null;
  metros: Metro[];
  publicPath: string | null; // the public, search-friendly page for this listing
  publicUrl: string | null;
}) {
  const [v, setV] = useState({
    businessName: vendor?.businessName ?? "",
    category: vendor?.category ?? "",
    bio: vendor?.bio ?? "",
    metro: vendor?.metro ?? "",
    website: vendor?.website ?? "",
  });
  const save = useAction();
  const publish = useAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const missing = [
    !vendor && "save your business name and type",
    vendor && !vendor.bio && "a short bio",
    vendor && !vendor.metro && "your city",
    vendor && !vendor.packageCount && "at least one package",
  ].filter(Boolean) as string[];

  return (
    <div className="mt-6 space-y-6">
      <form
        className={`${panelClasses} grid gap-4 p-6 sm:grid-cols-2`}
        onSubmit={(e) => {
          e.preventDefault();
          save.run(
            () =>
              saveBusinessAction({
                businessName: v.businessName.trim() || undefined,
                category: (v.category || undefined) as never,
                bio: v.bio.trim() || undefined,
                metro: v.metro || undefined,
                website: v.website.trim() || undefined,
              }),
            undefined,
            "Saved."
          );
        }}
      >
        <label className="block">
          <span className={labelClasses}>Business name</span>
          <input className={fieldClasses} value={v.businessName} onChange={set("businessName")} required={!vendor} />
        </label>
        <label className="block">
          <span className={labelClasses}>What you do</span>
          <select className={fieldClasses} value={v.category} onChange={set("category")} required={!vendor}>
            <option value="">Choose a category</option>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClasses}>City</span>
          <select className={fieldClasses} value={v.metro} onChange={set("metro")}>
            <option value="">Choose a city</option>
            {metros.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}, {m.state}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClasses}>Website</span>
          <input type="url" className={fieldClasses} value={v.website} onChange={set("website")} placeholder="https://" />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClasses}>Bio</span>
          <textarea
            className={fieldClasses}
            rows={4}
            maxLength={1500}
            value={v.bio}
            onChange={set("bio")}
            placeholder="2-4 sentences in your own voice."
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" color="gray" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
          <Status error={save.error} notice={save.notice} />
        </div>
      </form>

      {vendor && (
        <section className={`${panelClasses} p-6`}>
          <h2 className="text-base font-semibold">
            {vendor.published ? "You're live. Couples can find you." : "Not published yet"}
          </h2>
          {!vendor.published && missing.length > 0 && (
            <p className="mt-1 text-sm text-amber-800">Before you publish: {missing.join(", ")}.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              color={vendor.published ? "gray" : "cyan"}
              disabled={publish.pending || (!vendor.published && missing.length > 0)}
              onClick={() => publish.run(() => publishAction({ publish: !vendor.published }))}
            >
              {vendor.published ? "Unpublish" : "Publish my listing"}
            </Button>
            {vendor.published && publicPath && (
              <a
                href={publicPath}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                View public page ↗
              </a>
            )}
            <Status error={publish.error} notice="" />
          </div>
          {publicUrl && (
            <p className="mt-3 text-xs text-gray-500">
              {vendor.published ? (
                <>
                  Your public page, which search engines can find: <span className="break-all text-gray-700">{publicUrl}</span>
                </>
              ) : (
                "Your public page goes live, and search engines can find it, when you publish."
              )}
            </p>
          )}
        </section>
      )}

      {vendor && <Reviews reviews={vendor.reviews} clients={vendor.clients} requests={vendor.reviewRequests} />}
    </div>
  );
}

function Reviews({ reviews, clients, requests }: { reviews: Review[]; clients: Client[]; requests: SentRequest[] }) {
  const remove = useAction();
  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">Reviews ({reviews.length})</h2>
      <p className="mt-1 text-sm text-gray-600">
        Reviews come from your clients: ask them below and they write it themselves.
      </p>
      <ReviewRequests clients={clients} requests={requests} />
      {reviews.length > 0 && (
        <ul className="mt-4 space-y-3">
          {reviews.map((t) => (
            <li key={t.id} className="border-l-2 border-gray-200 pl-3 text-sm">
              <p className="line-clamp-3">&ldquo;{t.body}&rdquo;</p>
              <p className="mt-1 text-xs text-gray-500">
                {t.author_name}
                {t.rating ? ` · ${t.rating}★` : ""}
                {` · ${reviewBadge(t)}`}
                {!t.verified && (t.source ?? "vendor") === "vendor" && (
                  <button
                    type="button"
                    className="ml-3 text-red-600 underline disabled:opacity-50"
                    disabled={remove.pending}
                    onClick={() => remove.run(() => deleteReviewAction({ id: t.id }))}
                  >
                    Remove
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {remove.error && <Status error={remove.error} notice="" />}
    </section>
  );
}

function Status({ error, notice }: { error: string; notice: string }) {
  if (error)
    return (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    );
  return notice ? (
    <p role="status" className="text-sm text-emerald-700">
      {notice}
    </p>
  ) : null;
}
