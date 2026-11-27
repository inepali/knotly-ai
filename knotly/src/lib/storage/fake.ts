// src/lib/storage/fake.ts — an in-memory stand-in for "@/lib/storage" in tests:
//   vi.mock("@/lib/storage", () => import("@/lib/storage/fake"));
// It records every call as "op:area/path" so tests can check what happened, in order.
import type { Area, PublicArea, UploadTicket } from "./areas";

export * from "./areas";

export const UPLOAD_TICKET_SECONDS = 300;
export const PUBLIC_LINK_SECONDS = 86_400;

export const fakeStorage = {
  calls: [] as string[],
  /** Paths whose upload "didn't arrive" (verifyUpload fails for them). */
  missing: new Set<string>(),
  listeners: [] as ((call: string) => void)[],
  reset() {
    this.calls = [];
    this.missing.clear();
    this.listeners = [];
  },
  /** Also send each call somewhere else (e.g. a test's own ordered log). */
  listen(fn: (call: string) => void) {
    this.listeners.push(fn);
  },
};
const log = (op: string, area: Area, paths: string[]) => {
  const call = `${op}:${area}/${paths.join(",")}`;
  fakeStorage.calls.push(call);
  for (const fn of fakeStorage.listeners) fn(call);
};

export async function uploadTicket(area: Area, path: string, opts: { contentType: string; bytes: number }): Promise<UploadTicket> {
  log("ticket", area, [path]);
  return { via: "r2", url: `https://r2.test/${area}/${path}`, headers: { "Content-Type": opts.contentType } };
}
export async function putObject(area: Area, path: string) {
  log("put", area, [path]);
}
export async function getObject(area: Area, path: string) {
  log("get", area, [path]);
  return new ArrayBuffer(8);
}
export async function headObject(area: Area, path: string) {
  log("head", area, [path]);
  return fakeStorage.missing.has(path) ? null : { bytes: 1234, contentType: "image/webp" };
}
export async function signedUrls(area: Area, paths: string[]) {
  return new Map(paths.map((p) => [p, `https://signed.test/${area}/${p}`]));
}
export async function signedUrl(area: Area, path: string) {
  return `https://signed.test/${area}/${path}`;
}
export function publicTarget(area: PublicArea, path: string) {
  return `https://public.test/${area}/${path}`;
}
export async function removeObjects(area: Area, paths: string[]) {
  const list = paths.filter(Boolean);
  if (list.length) log("remove", area, list);
}
export async function verifyUpload(area: Area, path: string) {
  log("verify", area, [path]);
  return fakeStorage.missing.has(path) ? "The file didn't finish uploading. Please try again." : null;
}
