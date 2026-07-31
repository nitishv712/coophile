import type { Metadata } from "next";
import { Inter, Noto_Serif, Public_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-noto-serif",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Coophile — Retro Multiplayer Emulator",
  description:
    "Play retro games with friends. Browser-based NES, SNES, and GBA emulation with peer-to-peer multiplayer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables must live on <html>, not <body>: `@theme` declares
    // --font-body: var(--font-inter) at :root, and a var() inside a custom
    // property is resolved where it is declared. On <body> the variables would
    // be out of scope there, silently invalidating every font token.
    <html
      lang="en"
      className={`${inter.variable} ${notoSerif.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Icon font. next/font cannot handle a variable icon font, so this one
            is loaded the ordinary way. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="font-body bg-surface text-on-surface min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
