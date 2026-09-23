import type { Metadata } from "next";
import { preconnect, preload } from "react-dom";

export const metadata: Metadata = {
  title: "Play — Coophile",
  description: "Browser-based emulation, running locally.",
};

/**
 * EmulatorJS is fetched from its CDN the moment the page mounts, then pulls
 * its core (several MB) from the same host. Emitting the hints during server
 * rendering puts them in <head>, so the connection is open and the loader in
 * flight before the client bundle has even hydrated.
 */
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  preconnect("https://cdn.emulatorjs.org");
  preload("https://cdn.emulatorjs.org/stable/data/loader.js", { as: "script" });
  return children;
}
