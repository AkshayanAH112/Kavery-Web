import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/console/LoginForm";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/console");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="theme-night grain relative hidden overflow-hidden bg-bg text-fg lg:block">
        <div aria-hidden className="absolute -left-[30%] top-[18%] h-[34vh] w-[160%] -rotate-[24deg] bg-brand" />
        <div aria-hidden className="absolute -left-[30%] top-[58%] h-[1.6vh] w-[160%] -rotate-[24deg] bg-accent" />
        <div className="relative flex h-full flex-col items-start justify-between p-14">
          <Image src="/brand/ksc-crest.webp" alt="Kavery Sports Club crest" width={900} height={890} loading="eager" className="h-auto w-56 drop-shadow-[0_30px_60px_rgb(0_0_0/0.55)]" />
          <p className="display text-7xl">
            Kavery
            <span className="block text-accent">Staff console</span>
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Image src="/brand/ksc-crest.png" alt="Kavery Sports Club crest" width={64} height={64} className="h-16 w-16 lg:hidden" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight lg:mt-0">Sign in</h1>
          <p className="mt-3 text-muted-foreground">For club staff. Your administrator creates your account.</p>
          <LoginForm />
          <Link href="/" className="mt-10 inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-fg">
            Back to the public site
          </Link>
        </div>
      </div>
    </main>
  );
}
