// src/components/reviews/ReviewForm.tsx — write a review: stars, words, name. Used on the public
// /review/{token} page and in the couple's dashboard.
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, labelClasses } from "@/components/ui/fields";
import { REVIEW_MAX, REVIEW_MIN } from "@/lib/review-requests";

type Values = { name: string; rating: number; body: string; website?: string };
type Result = { ok: boolean; error?: string };

function Star({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-8 w-8 ${on ? "fill-amber-400" : "fill-gray-200"}`}>
      <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
    </svg>
  );
}

export default function ReviewForm({
  vendorName,
  defaultName = "",
  submit,
  onDone,
}: {
  vendorName: string;
  defaultName?: string;
  submit: (v: Values) => Promise<Result>;
  onDone?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState(defaultName);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const shown = hover || rating;

  if (done)
    return (
      <div role="status" className="rounded-2xl bg-emerald-50 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-900">Thank you!</p>
        <p className="mt-1 text-sm text-emerald-800">Your review of {vendorName} is posted. It means a lot to them.</p>
      </div>
    );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return setError("Pick 1 to 5 stars.");
        setError("");
        start(async () => {
          const r = await submit({ name: name.trim(), rating, body: body.trim(), website });
          if (!r.ok) return setError(r.error ?? "Something went wrong.");
          setDone(true);
          onDone?.();
        });
      }}
    >
      <fieldset>
        <legend className={labelClasses}>How was working with {vendorName}?</legend>
        <div className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => setRating(n)}
              className="rounded focus-visible:outline-2 focus-visible:outline-cyan-500"
            >
              <Star on={n <= shown} />
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="review-body" className={labelClasses}>Your review</label>
        <textarea
          id="review-body"
          className={`${fieldClasses} mt-1`}
          rows={5}
          minLength={REVIEW_MIN}
          maxLength={REVIEW_MAX}
          required
          placeholder="What stood out? Would you recommend them to other couples?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">{body.trim().length < REVIEW_MIN ? `At least ${REVIEW_MIN} characters.` : `${body.length}/${REVIEW_MAX}`}</p>
      </div>
      <div>
        <label htmlFor="review-name" className={labelClasses}>Name shown with your review</label>
        <input id="review-name" className={`${fieldClasses} mt-1`} maxLength={80} required placeholder="e.g. Priya & Sam" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" color="cyan" className="w-full" disabled={pending}>
        {pending ? "Posting…" : "Post review"}
      </Button>
      <p className="text-center text-xs text-gray-500">Your review appears on {vendorName}&apos;s Knotly page.</p>
    </form>
  );
}
