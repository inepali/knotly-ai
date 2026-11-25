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
              Post your wedding once. Let the right vendors come to you.
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Tell Knotly your date, city, budget and the vendors you need. Vendors who are free on your day and fit your
              budget send you estimates, and every conversation stays in one place.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button href="/signup" color="cyan">
                Start planning
              </Button>
              <Button href="/signup?role=vendor" variant="outline">
                I&apos;m a wedding vendor
              </Button>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              Already have an account?{" "}
              <a href="/signin" className="text-cyan-700 underline">
                Sign in
              </a>
            </p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
