// src/components/ui/SiteHeader.tsx — Pocket-style header for pages outside the chat.
"use client";
import Link from "next/link";
import { Popover, PopoverBackdrop, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Button } from "./Button";
import { Container } from "./Container";
import { Logo } from "./Logo";

const links = [
  ["Plan with Knotly", "/chat"],
  ["Find vendors", "/search"],
  ["Messages", "/inbox"],
] as const;

function MenuIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 6h14M5 18h14M5 12h14" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header>
      <nav>
        <Container className="relative z-50 flex justify-between py-6">
          <div className="relative z-10 flex items-center gap-12">
            <Link href="/" aria-label="Knotly home">
              <Logo />
            </Link>
            <div className="hidden lg:flex lg:gap-8">
              {links.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="-mx-3 -my-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Popover className="lg:hidden">
              <PopoverButton
                className="relative z-10 -m-2 inline-flex items-center rounded-lg stroke-gray-900 p-2 hover:bg-gray-200/50"
                aria-label="Toggle site navigation"
              >
                <MenuIcon className="h-6 w-6" />
              </PopoverButton>
              <PopoverBackdrop className="fixed inset-0 z-0 bg-gray-300/60 backdrop-blur-sm" />
              <PopoverPanel className="absolute inset-x-0 top-0 z-0 origin-top rounded-b-2xl bg-gray-50 px-6 pt-24 pb-6 shadow-2xl shadow-gray-900/20">
                <div className="space-y-4">
                  {links.map(([label, href]) => (
                    <PopoverButton as={Link} key={href} href={href} className="block text-base/7 tracking-tight text-gray-700">
                      {label}
                    </PopoverButton>
                  ))}
                </div>
                <div className="mt-8">
                  <Button href="/chat" color="cyan" className="w-full">
                    Start planning
                  </Button>
                </div>
              </PopoverPanel>
            </Popover>
            <div className="max-lg:hidden">
              <Button href="/chat" color="cyan">
                Start planning
              </Button>
            </div>
          </div>
        </Container>
      </nav>
    </header>
  );
}
