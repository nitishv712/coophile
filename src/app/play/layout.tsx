import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play — Coophile",
  description: "Browser-based emulation, running locally.",
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
