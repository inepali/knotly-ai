// src/lib/auth.ts — shared by the /api/auth/* routes
import { z } from "zod";

export const TERMS_VERSION = "2026-09";

// Users register with either an email or a phone number (E.164, e.g. +17045551234).
export const Identifier = z.discriminatedUnion("method", [
  z.object({ method: z.literal("email"), identifier: z.email() }),
  z.object({
    method: z.literal("phone"),
    identifier: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use the format +17045551234"),
  }),
]);
export type Identifier = z.infer<typeof Identifier>;

export const Password = z.string().min(8, "Use at least 8 characters");

// Roles a person can pick at sign-up. 'admin' is never self-assigned; set it in the database.
export const SignupRole = z.enum(["couple", "vendor"]);
export type SignupRole = z.infer<typeof SignupRole>;

// { email } or { phone }, the shape supabase-js expects.
export const credential = ({ method, identifier }: Identifier) =>
  method === "email" ? { email: identifier.toLowerCase() } : { phone: identifier };

export const fail = (error: string, status = 400) =>
  Response.json({ ok: false, error }, { status });

export function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Please check your details.";
}
