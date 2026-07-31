"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

/**
 * Sticky translucent top bar shared by every page.
 *
 * Links point only at routes that exist — a nav full of dead links is worse
 * than a short one.
 */

const LINKS = [
  { href: "/games", label: "Game Library" },
  { href: "/lobby", label: "Netplay" },
  { href: "/admin", label: "Admin" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-surface-container-lowest/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="flex justify-between items-center gap-4 px-6 lg:px-12 py-4 w-full max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-8 lg:gap-12 min-w-0">
          <Link
            href="/"
            className="font-headline text-xl sm:text-2xl font-semibold text-primary flex items-center gap-3 shrink-0"
          >
            <Logo size={32} className="shrink-0" />
            <span>Coophile</span>
          </Link>

          <div className="hidden md:flex gap-2 items-center">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "font-label tracking-widest uppercase text-xs font-semibold text-primary border-b-2 border-primary pb-1 px-3"
                      : "font-label tracking-widest uppercase text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high/50 rounded-lg px-3 py-2 transition-colors"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <Link
          href="/games"
          className="font-label tracking-widest uppercase text-xs text-primary font-semibold hover:bg-surface-container-high/50 px-4 py-2 rounded-lg transition-all shrink-0 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">play_circle</span>
          <span className="hidden sm:inline">Play</span>
        </Link>
      </div>
    </nav>
  );
}
