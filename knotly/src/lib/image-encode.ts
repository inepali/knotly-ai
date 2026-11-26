// src/lib/image-encode.ts — shrink a photo in the browser before upload (WebP, JPEG fallback).
import { fitWithin } from "@/lib/portfolio";

export async function encodeImage(file: File, edge: number, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // older Safari returns PNG for WebP
  if (!blob) throw new Error("encode");
  return { blob, ext: blob.type === "image/webp" ? "webp" : "jpg", ...size };
}
