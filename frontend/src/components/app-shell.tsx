"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { ACCOUNT, NAV } from "./nav";

const LOGOS = {
  sidebar: { src: "/brand/logo-sidebar.svg", width: 150, height: 42 },
  tablet: { src: "/brand/logo-tablet.svg", width: 118, height: 33 },
  mobile: { src: "/brand/logo-mobile.svg", width: 100, height: 28 },
};

function Logo({ size, className }: { size: keyof typeof LOGOS; className?: string }) {
  const logo = LOGOS[size];
  return <Image {...logo} alt="Cinsight" priority unoptimized className={className} />;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3.5 py-3.25 text-14 font-semibold transition-colors",
                  active ? "bg-brand text-on-brand-nav" : "text-ink-nav hover:bg-surface hover:text-ink",
                )}
              >
                <Icon name={item.icon} className="size-4.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AccountIdentity() {
  return (
    <span className="flex items-start gap-2.75 text-left">
      <span aria-hidden="true" className="size-8 shrink-0 rounded-5 bg-brand" />
      <span className="flex min-w-0 flex-col gap-0.5 text-12 leading-15 tracking-label text-ink-3">
        <span className="truncate font-semibold">{ACCOUNT.name}</span>
        <span>{ACCOUNT.role}</span>
      </span>
    </span>
  );
}

function LogoutButton() {
  return (
    <Button asChild variant="outline" size="md" className="w-full">
      <Link href="/">Log out</Link>
    </Button>
  );
}

/** Account name, role and logout, opened from the avatar (topbar) or the account card (sidebar). */
function AccountMenu({ trigger, side }: { trigger: ReactNode; side: "top" | "bottom" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={side === "top" ? "start" : "end"}
        sideOffset={8}
        className="w-60 gap-3.5 rounded-12 border border-line bg-surface p-4 shadow-lg ring-0"
      >
        <AccountIdentity />
        <LogoutButton />
      </PopoverContent>
    </Popover>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col justify-between overflow-y-auto border-r border-line-soft bg-sidebar px-4.5 py-7 lg:flex">
      <div className="flex flex-col gap-9.25">
        <Link href="/overview" className="self-start rounded-lg">
          <Logo size="sidebar" />
        </Link>
        <NavLinks />
      </div>
      <AccountMenu
        side="top"
        trigger={
          <button
            type="button"
            aria-label={`Account: ${ACCOUNT.name}, ${ACCOUNT.role}`}
            className="w-full rounded-12 border border-line-soft px-4.25 py-4 transition-colors hover:bg-surface"
          >
            <AccountIdentity />
          </button>
        }
      />
    </aside>
  );
}

function MenuLines() {
  return (
    <span aria-hidden="true" className="flex flex-col gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-0.5 w-4 rounded-[1px] bg-ink-2 md:w-4.25" />
      ))}
    </span>
  );
}

const squareButton =
  "flex size-9 items-center justify-center rounded-[9px] border border-ghost text-ink-2 transition-colors hover:bg-surface md:size-9.5 md:rounded-lg";

/** Tablet and mobile: top bar with a full-screen menu and the avatar overlay. */
function Topbar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const bar = (menuButton: ReactNode) => (
    <div className="flex h-14 items-center justify-between border-b border-line-card bg-page px-4 md:h-15 md:px-6">
      <div className="flex items-center gap-2.5 md:gap-3.5">
        {menuButton}
        <Link href="/overview" onClick={close} className="rounded-lg">
          <Logo size="mobile" className="md:hidden" />
          <Logo size="tablet" className="hidden md:block" />
        </Link>
      </div>
      <AccountMenu
        side="bottom"
        trigger={
          <button
            type="button"
            aria-label={`Account: ${ACCOUNT.name}, ${ACCOUNT.role}`}
            className="size-7 rounded-5 bg-brand md:size-7.5"
          />
        }
      />
    </div>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-30 lg:hidden">
        {bar(
          <DialogPrimitive.Trigger asChild>
            <button type="button" aria-label="Open menu" className={squareButton}>
              <MenuLines />
            </button>
          </DialogPrimitive.Trigger>,
        )}
      </header>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-page outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          {bar(
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Close menu" className={squareButton}>
                <XIcon aria-hidden="true" className="size-4.5" />
              </button>
            </DialogPrimitive.Close>,
          )}
          <div className="flex flex-1 flex-col justify-between gap-8 overflow-y-auto px-4 py-6 md:px-6">
            <NavLinks onNavigate={close} />
            <div className="flex flex-col gap-3.5 rounded-12 border border-line-soft p-4">
              <AccountIdentity />
              <LogoutButton />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand px-4 py-2 text-on-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <Topbar />
      <main id="main" className="mx-auto flex w-full flex-col gap-4 px-4 pt-6 pb-8 md:px-6 lg:gap-5 lg:px-9 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
