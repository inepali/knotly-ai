import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "./site";

const KEYS = ["APP_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const set = (env: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
};
afterEach(() => set(Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)) as Record<string, string>));

describe("siteUrl", () => {
  it("prefers APP_URL, without a trailing slash", () => {
    set({ APP_URL: "https://knotly.net/", VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" });
    expect(siteUrl()).toBe("https://knotly.net");
  });
  it("uses the production domain on Vercel production", () => {
    set({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "knotly.net", VERCEL_URL: "knotly-abc.vercel.app" });
    expect(siteUrl()).toBe("https://knotly.net");
  });
  it("uses the preview's own address on a preview, never localhost", () => {
    set({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "knotly-git-feat-x.vercel.app", VERCEL_URL: "knotly-abc.vercel.app" });
    expect(siteUrl()).toBe("https://knotly-git-feat-x.vercel.app");
    set({ VERCEL_ENV: "preview", VERCEL_URL: "knotly-abc.vercel.app" });
    expect(siteUrl()).toBe("https://knotly-abc.vercel.app");
  });
  it("falls back to localhost on your machine", () => {
    set({});
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
