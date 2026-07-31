import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Netplay Lobby — Coophile",
  description: "Open a direct peer-to-peer link with a friend.",
};

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
