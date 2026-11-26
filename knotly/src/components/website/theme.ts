// src/components/website/theme.ts — CSS variables for a wedding website theme.
import type { CSSProperties } from "react";
import { THEMES, type ThemeKey } from "@/lib/wedding-site";

export function themeStyle(key: ThemeKey): CSSProperties {
  const t = THEMES[key] ?? THEMES.classic;
  return {
    ["--ws-bg" as string]: t.bg,
    ["--ws-ink" as string]: t.ink,
    ["--ws-accent" as string]: t.accent,
    ["--ws-soft" as string]: t.soft,
    background: t.bg,
    color: t.ink,
    fontFamily: t.font === "serif" ? 'ui-serif, Georgia, Cambria, "Times New Roman", serif' : "ui-sans-serif, system-ui, sans-serif",
  };
}
