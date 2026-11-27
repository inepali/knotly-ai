// src/components/ui/Logo.tsx — Knotly's mark: one ribbon tied into a love knot (infinity), in cyan.
// The under-ribbon is cut along the over-ribbon's edge where they cross, so it reads as a real knot.
// Same drawing as src/app/icon.svg (which puts it on a cyan tile).
import { useId } from "react";
import clsx from "clsx";

const OVER = "M52 22C58 26 58 38 52 42 46 46 38 42 32 32 26 22 18 18 12 22 6 26 6 38 12 42";
const UNDER = "M12 42C18 46 26 42 32 32 38 22 46 18 52 22";

/** The knot alone. Wider than tall (7:5): size it by height, e.g. `h-8 w-auto`. */
export function Logomark({ className, ...props }: React.ComponentPropsWithoutRef<"svg">) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="4 14 56 40" aria-hidden="true" className={clsx("fill-none", className)} {...props}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#155e75" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="32" cy="32" r="11" />
        </clipPath>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <path d={OVER} stroke="#000" strokeWidth="10.6" clipPath={`url(#${id}c)`} />
        </mask>
      </defs>
      <path d={UNDER} stroke={`url(#${id}g)`} strokeWidth="7" strokeLinecap="round" mask={`url(#${id}m)`} />
      <path d={OVER} stroke={`url(#${id}g)`} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <Logomark className="h-7 w-auto flex-none" />
      <span className="text-lg font-semibold tracking-tight text-gray-900">Knotly</span>
    </span>
  );
}
