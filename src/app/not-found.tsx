import Link from "next/link";
import SiteNav from "@/src/components/SiteNav";
import SiteFooter from "@/src/components/SiteFooter";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="flex-grow flex flex-col items-center justify-center text-center px-6 py-24">
        <span className="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-6">
          search_off
        </span>
        <h1 className="font-headline text-3xl sm:text-4xl font-bold text-on-surface mb-3">
          Page not found
        </h1>
        <p className="font-body text-on-surface-variant mb-8 max-w-md leading-relaxed">
          There&apos;s nothing at this address. It may have moved, or the link
          might be wrong.
        </p>
        <Link
          href="/"
          className="btn-primary text-sm px-8 py-3.5 inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
