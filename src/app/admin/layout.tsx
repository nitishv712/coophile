import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Coophile",
  description: "Manage the game catalog.",
  // Never index an operator's admin panel.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
