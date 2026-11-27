// src/lib/storage/client.ts — the browser side of an upload ticket from the server.
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { UploadTicket } from "./areas";

export type { UploadTicket } from "./areas";

/** Send one file with a ticket. Returns an error message, or null on success. */
export async function uploadWithTicket(ticket: UploadTicket, file: Blob): Promise<string | null> {
  try {
    if (ticket.via === "r2") {
      const res = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: file });
      return res.ok ? null : `Upload failed (${res.status}). Please try again.`;
    }
    const { error } = await supabaseBrowser()
      .storage.from(ticket.bucket)
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
    return error ? error.message : null;
  } catch {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "You're offline. Reconnect and try again.";
    // fetch only throws like this when the browser blocks the request, almost always the
    // bucket's CORS rules not allowing this site's address (see scripts/storage-check.mts).
    const where = typeof location !== "undefined" ? location.origin : "this site";
    console.error(`[storage] upload blocked: the storage bucket may not allow uploads from ${where} (CORS).`);
    return "Upload was blocked by the storage server. Please try again, or contact support if it keeps happening.";
  }
}
