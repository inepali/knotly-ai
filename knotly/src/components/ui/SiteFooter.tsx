// src/components/ui/SiteFooter.tsx — Pocket-style footer for pages outside the chat.
import Link from "next/link";
import { Container } from "./Container";
import { Logomark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-gray-200">
      <Container>
        <div className="flex flex-col items-start justify-between gap-8 py-10 md:flex-row md:items-center">
          <div className="flex items-center text-gray-900">
            <Logomark className="h-10 w-10 flex-none" />
            <div className="ml-4">
              <p className="text-base font-semibold">Knotly</p>
              <p className="text-sm text-gray-600">Wedding planning in the Carolinas, by chat.</p>
            </div>
          </div>
          <nav className="flex gap-8 text-sm text-gray-700">
            <Link href="/chat" className="hover:text-gray-900">Plan with Knotly</Link>
            <Link href="/search" className="hover:text-gray-900">Find vendors</Link>
            <Link href="/inbox" className="hover:text-gray-900">Messages</Link>
          </nav>
        </div>
        <p className="border-t border-gray-200 py-6 text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Knotly. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
