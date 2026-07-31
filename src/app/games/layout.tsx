import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game Library — Coophile",
  description: "Games hosted on this server. Pick one and play.",
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
