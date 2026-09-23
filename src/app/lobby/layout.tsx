import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Netplay Lobby — Coophile",
  description: "Open a direct peer-to-peer link with a friend.",
};

/**
 * Play starts only once the host presses Start, so a preload would go stale;
 * a warm connection to the emulator CDN is still worth having by then.
 */
export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* A literal <link> rather than react-dom's preconnect(): the function
          form is dropped from the streamed HTML for this route, the element
          is hoisted into <head> as intended. */}
      <link rel="preconnect" href="https://cdn.emulatorjs.org" />
      {children}
    </>
  );
}
