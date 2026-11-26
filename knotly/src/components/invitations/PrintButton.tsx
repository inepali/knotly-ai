"use client";
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
      Print / Save as PDF
    </button>
  );
}
