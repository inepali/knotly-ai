// src/components/dashboard/CoupleAccount.tsx — bottom of the couple's sidebar: profile photo
// (click to change), name, and Sign out.
"use client";
import { useRef, useState, useTransition } from "react";
import { removeAvatarAction, signOutAction, uploadAvatarAction } from "@/app/client/dashboard/actions";

const SIZE = 512; // photos are cropped square and shrunk here, so uploads stay small

/** Square-crop and shrink an image file to a JPEG blob. Throws if the browser can't read it. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85)
  );
}

export default function CoupleAccount({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    start(async () => {
      try {
        const blob = await shrink(file);
        const form = new FormData();
        form.set("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        const r = await uploadAvatarAction(form);
        if (!r.ok) setError(r.error);
      } catch {
        setError("We couldn't read that photo. Try a JPG, PNG or WebP.");
      }
    });
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          aria-label="Change profile photo"
          className="group relative size-10 flex-none overflow-hidden rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800 ring-1 ring-gray-900/10 focus-visible:outline-2 focus-visible:outline-cyan-600 disabled:opacity-60"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, already small
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center">{name.trim().charAt(0).toUpperCase() || "?"}</span>
          )}
          <span className="absolute inset-0 hidden items-center justify-center bg-gray-900/50 text-[10px] font-medium text-white group-hover:flex group-focus-visible:flex">
            Edit
          </span>
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">
            {pending ? (
              "Saving…"
            ) : (
              <>
                <button type="button" className="underline hover:text-gray-700" onClick={() => input.current?.click()}>
                  {avatarUrl ? "Change photo" : "Add photo"}
                </button>
                {avatarUrl && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="underline hover:text-gray-700"
                      onClick={() =>
                        start(async () => {
                          setError("");
                          const r = await removeAvatarAction();
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      Remove
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ""; // allow choosing the same file again
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <form action={signOutAction} className="mt-3">
        <button
          type="submit"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
