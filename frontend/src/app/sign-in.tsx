"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PixelBlast from "@/components/PixelBlast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const field =
  "h-11 rounded-lg border-field bg-inset px-3.25 text-13 leading-19 text-ink placeholder:text-ink-4 md:text-13";

/** No authentication: both buttons go straight to the Overview, and nothing typed here is sent anywhere. */
export function SignIn() {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const enter = () => router.push("/overview");

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-page px-4 py-10 md:px-6">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <PixelBlast color="#4FF7BC" speed={reducedMotion ? 0 : 0.5} enableRipples={!reducedMotion} />
      </div>

      <main className="w-full max-w-102 rounded-card border border-line-card bg-surface px-6 py-7 md:p-9">
        <form
          className="flex flex-col gap-4.5 md:gap-5.5"
          onSubmit={(event) => {
            event.preventDefault();
            enter();
          }}
        >
          <Image src="/brand/logo-signin.svg" alt="Cinsight" width={140} height={39} priority unoptimized />

          <div className="flex flex-col gap-1.75">
            <h1 className="text-26 font-semibold text-ink">Sign in</h1>
            <p className="text-13 leading-19 text-ink-3">Please enter your details</p>
          </div>

          <div className="flex flex-col gap-1.75">
            <Label htmlFor="email" className="text-13 leading-17 font-medium text-ink-2">
              Email
            </Label>
            <Input id="email" type="email" autoComplete="off" placeholder="you@company.com" className={field} />
          </div>

          <div className="flex flex-col gap-1.75">
            <Label htmlFor="password" className="text-13 leading-17 font-medium text-ink-2">
              Password
            </Label>
            <Input id="password" type="password" autoComplete="off" placeholder="••••••••••" className={field} />
          </div>

          <Button type="submit" className="w-full">
            Sign in
          </Button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-12 leading-17 text-ink-4">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" variant="outline" className="w-full font-medium text-ink-2" onClick={enter}>
            Continue with SSO
          </Button>
        </form>
      </main>
    </div>
  );
}
