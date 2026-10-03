// src/components/ui/Button.tsx — buttons in the Pocket style. Solid cyan for the main
// action on a screen, solid gray for secondary actions, outline for quiet ones.
import Link from "next/link";
import clsx from "clsx";

const baseStyles = {
  solid: "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-lg border px-[calc(--spacing(3)-1px)] py-[calc(--spacing(2)-1px)] text-sm transition-colors disabled:opacity-40",
};

const variantStyles = {
  solid: {
    cyan: "relative overflow-hidden bg-cyan-500 text-white before:absolute before:inset-0 before:transition-colors hover:before:bg-white/10 active:bg-cyan-600 active:text-white/80 active:before:bg-transparent",
    white: "bg-white text-cyan-900 hover:bg-white/90 active:bg-white/90 active:text-cyan-900/70",
    gray: "bg-gray-800 text-white hover:bg-gray-900 active:bg-gray-800 active:text-white/80",
  },
  outline: {
    gray: "border-gray-300 bg-white text-gray-700 hover:border-gray-400 active:bg-gray-100 active:text-gray-700/80",
  },
};

type ButtonProps = (
  | { variant?: "solid"; color?: keyof typeof variantStyles.solid }
  | { variant: "outline"; color?: keyof typeof variantStyles.outline }
) &
  (
    | Omit<React.ComponentPropsWithoutRef<typeof Link>, "color">
    | (Omit<React.ComponentPropsWithoutRef<"button">, "color"> & { href?: undefined })
  );

export function Button({ className, variant = "solid", color, ...props }: ButtonProps) {
  className = clsx(
    baseStyles[variant],
    variant === "outline"
      ? variantStyles.outline[(color as keyof typeof variantStyles.outline) ?? "gray"]
      : variantStyles.solid[(color as keyof typeof variantStyles.solid) ?? "gray"],
    className
  );
  return typeof props.href === "undefined" ? (
    <button className={className} {...(props as React.ComponentPropsWithoutRef<"button">)} />
  ) : (
    <Link className={className} {...(props as React.ComponentPropsWithoutRef<typeof Link>)} />
  );
}
