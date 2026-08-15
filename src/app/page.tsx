import Link from "next/link";
import Logo from "@/src/components/Logo";
import SiteNav from "@/src/components/SiteNav";
import SiteFooter from "@/src/components/SiteFooter";
import RomDropzone from "@/src/components/RomDropzone";
import { SYSTEMS, type SystemType } from "@/src/lib/emulator/types";

/** Icon per console, drawn from the real supported list rather than a fixed four. */
const SYSTEM_ICONS: Record<SystemType, string> = {
  nes: "videogame_asset",
  snes: "gamepad",
  gba: "sports_esports",
  gb: "stay_current_portrait",
  gbc: "smartphone",
  genesis: "dns",
  n64: "joystick",
};

const STEPS = [
  {
    num: "01",
    title: "Add a ROM",
    desc: "Point us at a game file you own. It stays in your browser.",
    icon: "upload_file",
  },
  {
    num: "02",
    title: "Share Code",
    desc: "Get a unique room code and send it to a friend.",
    icon: "share",
  },
  {
    num: "03",
    title: "Play Together",
    desc: "Both browsers run the same game, exchanging only inputs.",
    icon: "sports_esports",
  },
];

/**
 * The landing page. Everything here is static copy, so it is rendered on the
 * server — only the ROM dropzone, which touches the file system and
 * sessionStorage, ships as JavaScript.
 */
export default function Home() {
  return (
    <>
      <SiteNav />

      <main className="flex-grow flex flex-col items-center w-full">
        {/* ── Hero ─────────────────────────────────────── */}
        <section className="w-full max-w-screen-xl mx-auto px-6 lg:px-12 py-20 lg:py-28 flex flex-col items-center text-center">
          <Logo size={96} className="mb-10 text-primary" title="Coophile" />

          <h1 className="font-headline text-5xl sm:text-6xl lg:text-7xl text-on-surface mb-8 tracking-tight font-light">
            COOPHILE
          </h1>

          <p className="font-body text-lg sm:text-xl lg:text-2xl text-on-surface-variant max-w-2xl leading-relaxed mb-12 font-light">
            Retro gaming, reimagined. Play classic games with friends, right in
            your browser.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            <Link
              href="/games"
              id="btn-browse-games"
              className="btn-primary text-sm px-10 py-4 inline-flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">library_books</span>
              Game Library
            </Link>
            <Link
              href="/lobby"
              id="btn-play-online"
              className="btn-secondary text-sm px-10 py-4 inline-flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">bolt</span>
              Play Online
            </Link>
          </div>
        </section>

        {/* ── Supported systems ────────────────────────── */}
        <section className="w-full bg-surface-container-low py-16 border-y border-outline-variant/10">
          <div className="max-w-screen-xl mx-auto px-6 lg:px-12">
            <h2 className="font-headline text-center text-on-surface-variant text-lg italic mb-10">
              Cycle-accurate emulation for seven classic consoles
            </h2>
            <div className="flex flex-wrap justify-center gap-10 lg:gap-16 opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700">
              {(Object.keys(SYSTEMS) as SystemType[]).map((key) => (
                <div key={key} className="flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined icon-filled text-4xl text-primary">
                    {SYSTEM_ICONS[key]}
                  </span>
                  <span className="font-label tracking-widest uppercase text-xs text-on-surface-variant">
                    {key === "genesis" ? "Genesis" : key.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────── */}
        <section className="w-full max-w-screen-xl mx-auto px-6 lg:px-12 py-24 lg:py-28">
          <div className="text-center mb-16">
            <h2 className="font-headline text-3xl sm:text-4xl text-on-surface mb-4">
              How It Works
            </h2>
            <p className="font-body text-on-surface-variant max-w-xl mx-auto">
              Three steps from a game file to playing it with someone else.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {STEPS.map((step, index) => (
              <div
                key={step.num}
                id={`step-${index + 1}`}
                className="card p-8 flex flex-col h-full hover:border-primary/30 transition-colors group"
              >
                <div className="font-label tracking-widest text-tertiary mb-6 font-semibold">
                  {step.num}
                </div>
                <h3 className="font-headline text-2xl mb-4 text-on-surface">{step.title}</h3>
                <p className="font-body text-on-surface-variant text-sm leading-relaxed flex-grow">
                  {step.desc}
                </p>
                <div className="mt-8 rounded-xl overflow-hidden bg-surface-container-low aspect-video flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-primary/60 group-hover:scale-110 transition-transform duration-500">
                    {step.icon}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── One-off ROM drop ─────────────────────────── */}
        <section className="w-full max-w-screen-xl mx-auto px-6 lg:px-12 pb-24 lg:pb-32">
          <RomDropzone />
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
