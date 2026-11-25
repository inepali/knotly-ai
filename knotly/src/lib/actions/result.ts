// src/lib/actions/result.ts — the shape every shared action returns.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export type Sb = SupabaseClient;

export type Ok<T> = { ok: true; data: T };
export type Fail<E extends object = object> = { ok: false; error: string } & E;
export type ActionResult<T, E extends object = object> = Ok<T> | Fail<E>;

/** Per-request facts about the caller that aren't part of the form/tool input. */
export type ActionCtx = {
  /** Anonymous session that hasn't verified an email yet. */
  isGuest?: boolean;
};

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const fail = (error: string): Fail => ({ ok: false, error });

/** Validate input with the action's own schema; a readable error instead of a throw. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown
): { ok: true; data: z.output<S> } | Fail {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return fail(`${where}${issue.message}`);
}

/** `{ ok: true, ...data }`, or the failure as-is (for callers that want the data inline, like the Help tool). */
export function flat<T extends object, E extends object>(r: ActionResult<T, E>) {
  return r.ok ? { ok: true as const, ...r.data } : r;
}

