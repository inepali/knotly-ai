// src/app/page.tsx — home. (The full Pocket-style landing page is a separate step.)
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 py-20 sm:py-32">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-medium tracking-tight text-gray-900 sm:text-5xl">
              Plan your wedding by chatting.
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Tell Knotly your date, city and style. It finds vendors that fit, drafts your inquiries, and keeps every
              conversation in one place.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button href="/chat" color="cyan">
                Start planning
              </Button>
              <Button href="/search" variant="outline">
                Find vendors
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
