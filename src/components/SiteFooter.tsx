import Link from "next/link";

/**
 * Shared footer.
 *
 * The legal line states the project's actual position: emulation is lawful,
 * ROM distribution is the operator's responsibility. It deliberately avoids
 * "archival"/"preservation" framing, which is the usual cover story for ROM
 * sites and would misrepresent what this software does.
 */
export default function SiteFooter() {
  return (
    <footer className="bg-surface-dim w-full py-12 px-6 lg:px-12 mt-auto border-t border-outline-variant/15">
      <div className="max-w-screen-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <span className="font-headline text-lg italic text-on-surface">Coophile</span>
          <p className="font-body text-sm leading-relaxed text-on-surface-variant max-w-md">
            Emulator software is lawful; distributing copyrighted ROMs is not.
            Coophile ships with an empty library — whoever runs this server is
            responsible for what they add to it.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 md:justify-end items-start font-body text-sm">
          <Link
            href="/games"
            className="text-on-secondary-container hover:text-primary transition-all underline-offset-4 hover:underline"
          >
            Game Library
          </Link>
          <Link
            href="/lobby"
            className="text-on-secondary-container hover:text-primary transition-all underline-offset-4 hover:underline"
          >
            Netplay
          </Link>
          <Link
            href="/admin"
            className="text-on-secondary-container hover:text-primary transition-all underline-offset-4 hover:underline"
          >
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
