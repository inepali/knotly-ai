// src/components/ui/Logo.tsx — Knotly's mark: two linked rings (a knot), in Pocket's cyan.
import clsx from "clsx";

export function Logomark({ className, ...props }: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={clsx("fill-none", className)} {...props}>
      <circle cx="15" cy="20" r="10" className="stroke-cyan-500" strokeWidth="4" />
      <circle cx="25" cy="20" r="10" className="stroke-cyan-700" strokeWidth="4" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <Logomark className="h-8 w-8 flex-none" />
      <span className="text-lg font-semibold tracking-tight text-gray-900">Knotly</span>
    </span>
  );
}
