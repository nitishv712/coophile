"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

/**
 * The nav's right-hand slot: a Login button for visitors, a circular avatar
 * with an account menu once they are signed in.
 *
 * Signing in happens in place via the Google popup rather than a redirect to a
 * sign-in route, matching <SignInGate> — a visitor reading the landing page
 * should not lose their place to authenticate.
 */
export default function AuthButton() {
  const { user, configured, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click or Escape. Only wired up while the menu
  // is actually open, so the listeners cost nothing the rest of the time.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The session is resolved on the server before this ever paints, so there is
  // no loading state to hold a slot for.
  //
  // No server credentials means sign-in cannot work; a button that always
  // fails is worse than no button. <SignInGate> explains why on gated pages.
  if (!configured) return null;

  if (!user) {
    return (
      <button
        id="btn-nav-login"
        onClick={() => void signIn()}
        className="font-label tracking-widest uppercase text-xs text-primary font-semibold hover:bg-surface-container-high/50 px-4 py-2 rounded-lg transition-all shrink-0 flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-lg">login</span>
        <span className="hidden sm:inline">Login</span>
      </button>
    );
  }

  const label = user.name ?? user.email ?? "Account";
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        id="btn-nav-account"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${label}`}
        className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary/40 focus-visible:ring-primary transition-all flex items-center justify-center bg-primary-container text-on-primary-container"
      >
        {user.picture ? (
          // A plain <img>: the avatar comes from whichever identity provider
          // the visitor used, so there is no fixed host to whitelist for
          // next/image, and at 40px there is nothing worth optimising.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.picture}
            alt=""
            width={40}
            height={40}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-label text-sm font-semibold">{initial}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-xl bg-surface-container-lowest shadow-lg border border-outline-variant/20 py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-outline-variant/20 mb-1">
            <p className="font-body text-sm text-on-surface truncate">{user.name ?? "Signed in"}</p>
            {user.email && (
              <p className="font-body text-xs text-on-surface-variant truncate">{user.email}</p>
            )}
          </div>

          {user.isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 font-body text-sm text-on-surface hover:bg-surface-container-high/50 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">shield_person</span>
              Admin
            </Link>
          )}

          <button
            id="btn-nav-signout"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-2 font-body text-sm text-on-surface hover:bg-surface-container-high/50 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
