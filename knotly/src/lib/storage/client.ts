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
    return "Upload failed. Check your connection and try again.";
  }
}
