// src/app/(auth)/layout.tsx — shell for /signup and /signin. Someone who is already
// signed in (not a guest) has no business here, so send them home.
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Container } from "@/components/ui/Container";
import { supabaseServer } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user && !user.is_anonymous) {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
    redirect(homeFor(profile?.role));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 py-12 sm:py-20">
        <Container className="flex justify-center">{children}</Container>
      </main>
      <SiteFooter />
    </div>
  );
}
