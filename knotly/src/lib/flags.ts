// src/lib/flags.ts — feature switches readable on both server and client.

// PDF uploads to the knowledge base (Claude reads each PDF, which costs tokens).
// Off until launch; set NEXT_PUBLIC_KNOWLEDGE_PDF=1 to turn on.
export const PDF_UPLOADS_ENABLED = process.env.NEXT_PUBLIC_KNOWLEDGE_PDF === "1";
