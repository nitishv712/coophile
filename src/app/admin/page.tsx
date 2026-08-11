"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SiteNav from "@/src/components/SiteNav";
import { useAuth } from "@/src/components/AuthProvider";
import SiteFooter from "@/src/components/SiteFooter";
import CartridgeArt from "@/src/components/CartridgeArt";
import { SYSTEMS, type SystemType } from "@/src/lib/emulator/types";
import {
  COOP_MODES,
  DEFAULT_ACCENT,
  DEFAULT_GLYPH,
  allRomExtensions,
  slugify,
  systemForFileName,
  titleFromFileName,
  type CoopMode,
  type Game,
  type GameInput,
} from "@/src/lib/games/types";
import {
  adminCreateGame,
  adminDeleteGame,
  adminRemoveRom,
  adminUpdateGame,
  adminUploadRom,
  fetchGames,
} from "@/src/lib/games/client";

const BLANK: GameInput = {
  title: "",
  altTitle: "",
  system: "nes",
  year: "",
  publisher: "",
  players: 2,
  coop: "simultaneous",
  genre: "",
  blurb: "",
  accent: DEFAULT_ACCENT,
  glyph: DEFAULT_GLYPH,
  rights: { sourceUrl: "", license: "", attestedBy: "" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const label =
  "block font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-1.5 font-semibold";

export default function AdminPage() {
  // Identity comes from the Google session. <SignInGate> has already ensured
  // somebody is signed in by the time this renders; all that is left to check
  // is whether that somebody is on the admin allowlist.
  const { user, loading: checking, signOut } = useAuth();
  const isAdmin = user?.isAdmin === true;

  const [games, setGames] = useState<Game[]>([]);
  const [draft, setDraft] = useState<GameInput>(BLANK);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const romInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<Game | null>(null);

  // A file chosen before the game exists — uploaded once the entry is saved.
  const newRomInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(async () => {
    try {
      setGames(await fetchGames());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  // Load the catalog once signed in. Written as a promise chain so the state
  // updates land in callbacks rather than synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchGames()
      .then((found) => {
        if (!cancelled) setGames(found);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const run = useCallback(async (job: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await job();
      if (done) setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const resetForm = useCallback(() => {
    setDraft(BLANK);
    setEditingSlug(null);
    setAttested(false);
    setPendingFile(null);
  }, []);

  /**
   * Take a file straight off the operator's machine and prefill what we can
   * from it. The entry still has to be saved, but the ROM is chosen first,
   * which is the order people actually work in.
   */
  const acceptPendingFile = useCallback((file: File) => {
    setError(null);
    setNotice(null);
    setPendingFile(file);
    setDraft((current) => ({
      ...current,
      title: current.title || titleFromFileName(file.name),
      // A .zip name says nothing about the console, so only override when the
      // extension actually identifies one.
      system: systemForFileName(file.name) ?? current.system,
    }));
  }, []);

  const onDropFile = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) acceptPendingFile(file);
    },
    [acceptPendingFile],
  );

  const startEdit = useCallback((game: Game) => {
    setEditingSlug(game.slug);
    setAttested(true); // already attested when it was created
    setDraft({
      title: game.title,
      slug: game.slug,
      altTitle: game.altTitle ?? "",
      system: game.system,
      year: game.year,
      publisher: game.publisher,
      players: game.players,
      coop: game.coop,
      genre: game.genre,
      blurb: game.blurb,
      accent: game.accent,
      glyph: game.glyph,
      rights: {
        sourceUrl: game.rights.sourceUrl,
        license: game.rights.license,
        attestedBy: game.rights.attestedBy,
      },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const submit = useCallback(() => {
    const payload: GameInput = {
      ...draft,
      altTitle: draft.altTitle?.trim() ? draft.altTitle.trim() : undefined,
      slug: draft.slug?.trim() ? slugify(draft.slug) : slugify(draft.title),
    };
    const file = pendingFile;
    void run(
      async () => {
        const slug = editingSlug
          ? (await adminUpdateGame(editingSlug, payload)).slug
          : (await adminCreateGame(payload)).slug;
        // Save the entry first so a rejected ROM never loses the typed metadata.
        if (file) await adminUploadRom(slug, file);
        await reload();
        resetForm();
      },
      file
        ? `Game saved and ${file.name} uploaded.`
        : editingSlug
          ? "Game updated."
          : "Game added.",
    );
  }, [draft, editingSlug, pendingFile, run, reload, resetForm]);

  const pickRom = useCallback((game: Game) => {
    uploadTargetRef.current = game;
    const input = romInputRef.current;
    if (!input) return;
    // Zips are unpacked server-side, which is how most ROMs arrive.
    input.accept = [...SYSTEMS[game.system].extensions, ".zip"].join(",");
    input.value = "";
    input.click();
  }, []);

  const onRomChosen = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const game = uploadTargetRef.current;
      if (!file || !game) return;
      void run(async () => {
        await adminUploadRom(game.slug, file);
        await reload();
      }, `ROM attached to ${game.title}.`);
    },
    [run, reload],
  );

  // ── Gates ──────────────────────────────────────────────────────

  if (checking) {
    return (
      <>
        <SiteNav />
        <div className="flex-grow flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">
            progress_activity
          </span>
        </div>
      </>
    );
  }

  // The gate above this page already guarantees a signed-in Google account, so
  // the only remaining question is the allowlist. Show who is actually signed
  // in — "access denied" while logged into the wrong Google account is a
  // genuinely confusing state otherwise.
  if (!isAdmin) {
    return (
      <>
        <SiteNav />
        <div className="flex-grow flex flex-col items-center justify-center text-center px-6">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-6">
            lock
          </span>
          <h1 className="font-headline text-3xl font-bold mb-3">Admins only</h1>
          <p className="font-body text-on-surface-variant max-w-md leading-relaxed mb-2">
            You are signed in as{" "}
            <span className="font-mono text-on-surface">{user?.email ?? "an unknown account"}</span>
            , which is not on the admin allowlist.
          </p>
          <p className="font-body text-sm text-on-surface-variant/70 max-w-md leading-relaxed mb-8">
            Add the address to <code className="font-mono text-primary">ADMIN_EMAILS</code> in the
            environment and restart, or sign in with an account that is already listed.
          </p>
          <button
            id="btn-admin-switch-account"
            onClick={() => void signOut()}
            className="btn-secondary text-sm px-6 py-3"
          >
            Sign in with a different account
          </button>
        </div>
      </>
    );
  }

  // ── Panel ──────────────────────────────────────────────────────

  return (
    <>
      <SiteNav />

      <main className="flex-grow w-full max-w-screen-xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <p className="font-label tracking-widest uppercase text-xs text-tertiary mb-3 font-semibold">
              /admin
            </p>
            <h1 className="font-headline text-4xl sm:text-5xl font-bold text-primary leading-tight">
              CATALOG ADMIN
            </h1>
            <p className="font-body text-on-surface-variant mt-2">
              {games.length} game{games.length === 1 ? "" : "s"} in the catalog
            </p>
          </div>
          <button
            id="btn-admin-signout"
            onClick={() => void signOut()}
            className="btn-secondary text-xs px-5 py-2.5"
          >
            Sign out
          </button>
        </header>

        {error && (
          <div
            id="admin-error"
            className="mb-6 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-lg">error</span>
            {error}
          </div>
        )}
        {notice && (
          <div
            id="admin-notice"
            className="mb-6 rounded-xl bg-primary/10 text-primary px-4 py-3 text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined icon-filled text-lg">
              check_circle
            </span>
            {notice}
          </div>
        )}

        <input
          type="file"
          ref={romInputRef}
          onChange={onRomChosen}
          className="hidden"
          id="admin-rom-input"
        />

        {/* ── Editor ─────────────────────────────────── */}
        <div className="mb-14">
          <h2 className="font-headline text-3xl sm:text-4xl font-bold text-on-surface mb-2 tracking-tight">
            {editingSlug ? `Edit “${draft.title}”` : "Add a game"}
          </h2>
          <p className="font-body text-base text-on-surface-variant leading-relaxed mb-8">
            Pick the file from your computer, then fill in the details.
          </p>

          <div className="space-y-6">
            {/* Upload from this machine */}
            <input
              type="file"
              ref={newRomInputRef}
              id="new-rom-input"
              className="hidden"
              accept={[...allRomExtensions(), ".zip"].join(",")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) acceptPendingFile(file);
                event.target.value = "";
              }}
            />

            <section
              id="rom-upload-zone"
              data-has-file={pendingFile ? "true" : "false"}
              onClick={() => newRomInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDropFile}
              className={`card border-2 border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200 ${
                pendingFile
                  ? "border-primary bg-primary/5"
                  : dragging
                    ? "border-primary bg-primary/10"
                    : "border-outline-variant/50 hover:border-primary"
              }`}
            >
              {pendingFile ? (
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span className="material-symbols-outlined icon-filled text-2xl text-primary">
                    description
                  </span>
                  <span
                    id="pending-file-name"
                    className="font-mono text-sm text-on-surface"
                  >
                    {pendingFile.name}
                  </span>
                  <span className="font-body text-xs text-on-surface-variant">
                    {formatSize(pendingFile.size)}
                  </span>
                  <button
                    id="btn-clear-pending"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingFile(null);
                    }}
                    className="font-body text-xs text-on-surface-variant hover:text-error underline underline-offset-2"
                  >
                    remove
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={`material-symbols-outlined text-5xl mb-4 ${
                      dragging ? "text-primary" : "text-on-surface-variant/40"
                    }`}
                  >
                    upload_file
                  </span>
                  <h3 className="font-headline text-xl font-bold text-on-surface mb-2">
                    {dragging ? "Drop it here" : "Drag and drop a ROM file"}
                  </h3>
                  <p className="font-body text-sm text-on-surface-variant mb-6">
                    or click to browse your computer (
                    {[...allRomExtensions(), ".zip"].join(", ")})
                  </p>
                  <button
                    type="button"
                    className="btn-secondary text-xs px-6 py-3"
                  >
                    Select file
                  </button>
                </>
              )}
            </section>

            {/* Core details */}
            <section className="card p-6 lg:p-8">
              <h3 className="font-headline text-xl font-bold text-on-surface mb-6 pb-4 border-b border-outline-variant/15">
                Core details
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="f-title">
                    Title
                  </label>
                  <input
                    id="f-title"
                    className="field"
                    placeholder="e.g. Super Tilt Bro."
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-system">
                    System
                  </label>
                  <select
                    id="f-system"
                    className="field"
                    value={draft.system}
                    onChange={(e) =>
                      setDraft({ ...draft, system: e.target.value as SystemType })
                    }
                  >
                    {Object.entries(SYSTEMS).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="f-players">
                    Players
                  </label>
                  <input
                    id="f-players"
                    type="number"
                    min={1}
                    max={8}
                    className="field"
                    value={draft.players}
                    onChange={(e) =>
                      setDraft({ ...draft, players: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-coop">
                    Co-op mode
                  </label>
                  <select
                    id="f-coop"
                    className="field"
                    value={draft.coop}
                    onChange={(e) =>
                      setDraft({ ...draft, coop: e.target.value as CoopMode })
                    }
                  >
                    {COOP_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Optional details — open when editing so filled values are visible */}
            <section className="card overflow-hidden">
              <details
                key={editingSlug ?? "new"}
                open={Boolean(editingSlug)}
                className="group"
              >
                <summary className="font-headline text-lg font-bold text-on-surface px-6 lg:px-8 py-5 cursor-pointer flex justify-between items-center gap-4 list-none outline-none select-none">
                  <span>
                    Optional details
                    <span className="font-body text-sm font-normal text-on-surface-variant/70">
                      {" "}
                      — description, artwork, year, licence, source
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-outline shrink-0 group-open:rotate-180 transition-transform duration-300">
                    expand_more
                  </span>
                </summary>

                <div className="px-6 lg:px-8 pb-8 border-t border-outline-variant/15 pt-6">
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={label} htmlFor="f-slug">
                    Slug (URL id)
                  </label>
                  <input
                    id="f-slug"
                    className="field"
                    placeholder={slugify(draft.title) || "auto"}
                    value={draft.slug ?? ""}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-alt">
                    Also known as
                  </label>
                  <input
                    id="f-alt"
                    className="field"
                    value={draft.altTitle ?? ""}
                    onChange={(e) => setDraft({ ...draft, altTitle: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-year">
                    Year
                  </label>
                  <input
                    id="f-year"
                    className="field"
                    value={draft.year}
                    onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-publisher">
                    Publisher
                  </label>
                  <input
                    id="f-publisher"
                    className="field"
                    value={draft.publisher}
                    onChange={(e) => setDraft({ ...draft, publisher: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-genre">
                    Genre
                  </label>
                  <input
                    id="f-genre"
                    className="field"
                    value={draft.genre}
                    onChange={(e) => setDraft({ ...draft, genre: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-license">
                    Licence
                  </label>
                  <input
                    id="f-license"
                    className="field"
                    placeholder="WTFPL, public domain, my own cartridge…"
                    value={draft.rights.license}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rights: { ...draft.rights, license: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-source">
                    Source link
                  </label>
                  <input
                    id="f-source"
                    className="field"
                    placeholder="https://author.itch.io/game"
                    value={draft.rights.sourceUrl}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rights: { ...draft.rights, sourceUrl: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-attested">
                    Cleared by
                  </label>
                  <input
                    id="f-attested"
                    className="field"
                    placeholder="your name"
                    value={draft.rights.attestedBy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rights: { ...draft.rights, attestedBy: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={label} htmlFor="f-accent">
                      Accent
                    </label>
                    <input
                      id="f-accent"
                      type="color"
                      className="field h-10 p-1"
                      value={draft.accent}
                      onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="f-glyph">
                      Glyph
                    </label>
                    <input
                      id="f-glyph"
                      className="field"
                      maxLength={8}
                      value={draft.glyph}
                      onChange={(e) => setDraft({ ...draft, glyph: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <label className={label} htmlFor="f-blurb">
                Description
              </label>
              <textarea
                id="f-blurb"
                rows={2}
                className="field"
                value={draft.blurb}
                onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
              />
                </div>
              </details>
            </section>

            {/* Confirmation & submit */}
            <section className="pt-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center mt-1 shrink-0">
                  <input
                    id="f-attest"
                    type="checkbox"
                    checked={attested}
                    onChange={(e) => setAttested(e.target.checked)}
                    className="peer appearance-none w-5 h-5 border-2 border-outline rounded-sm bg-surface-container-lowest checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface transition-colors cursor-pointer"
                  />
                  <span className="material-symbols-outlined absolute text-on-primary text-sm opacity-0 peer-checked:opacity-100 pointer-events-none left-[2px]">
                    check
                  </span>
                </div>
                <span className="font-body text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                  I have the right to distribute this game from this server.
                </span>
              </label>

              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <button
                  id="btn-save-game"
                  onClick={submit}
                  disabled={busy || !attested}
                  className="btn-primary text-sm px-6 py-3 disabled:opacity-40"
                >
                  {busy ? "Saving…" : editingSlug ? "Save changes" : "Add game"}
                </button>
                {editingSlug && (
                  <button onClick={resetForm} className="btn-secondary text-sm px-6 py-3">
                    Cancel
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ── Catalog ────────────────────────────────── */}
        <h2 className="font-headline text-2xl font-bold mb-5">Catalog</h2>
        {games.length === 0 ? (
          <p id="admin-empty" className="font-body text-sm text-on-surface-variant">
            Nothing yet. Add a game above, then attach its ROM.
          </p>
        ) : (
          <div className="space-y-3">
            {games.map((game) => (
              <div
                key={game.slug}
                id={`admin-game-${game.slug}`}
                data-has-rom={game.rom ? "true" : "false"}
                className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="w-full sm:w-28 shrink-0 rounded-xl overflow-hidden">
                  <CartridgeArt game={game} loaded={Boolean(game.rom)} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-headline font-bold text-lg truncate text-on-surface">
                      {game.title}
                    </h3>
                    <span className="font-mono text-xs text-outline">/{game.slug}</span>
                  </div>
                  <p className="font-label text-xs tracking-widest uppercase text-on-surface-variant mt-1">
                    {game.system} · {game.players}P {game.coop}
                    {game.rights.license && ` · ${game.rights.license}`}
                  </p>
                  <p className="font-mono text-xs mt-1">
                    {game.rom ? (
                      <span className="text-primary">
                        {game.rom.fileName} · {formatSize(game.rom.size)} ·{" "}
                        {game.rom.sha256.slice(0, 12)}
                      </span>
                    ) : (
                      <span className="text-tertiary">no ROM attached</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    id={`btn-rom-${game.slug}`}
                    onClick={() => pickRom(game)}
                    disabled={busy}
                    title={`${SYSTEMS[game.system].extensions.join(" / ")} or a .zip containing one`}
                    className="btn-secondary text-xs px-3 py-2 disabled:opacity-40"
                  >
                    {busy ? "Uploading…" : game.rom ? "Replace ROM" : "Attach ROM"}
                  </button>
                  {game.rom && (
                    <button
                      onClick={() =>
                        run(async () => {
                          await adminRemoveRom(game.slug);
                          await reload();
                        }, "ROM removed.")
                      }
                      className="px-3 py-2 rounded-xl font-label text-xs uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors"
                    >
                      Detach
                    </button>
                  )}
                  <button
                    id={`btn-edit-${game.slug}`}
                    onClick={() => startEdit(game)}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    Edit
                  </button>
                  <button
                    id={`btn-delete-${game.slug}`}
                    onClick={() => {
                      if (!confirm(`Delete ${game.title} and its ROM?`)) return;
                      void run(async () => {
                        await adminDeleteGame(game.slug);
                        await reload();
                      }, "Game deleted.");
                    }}
                    className="px-3 py-2 rounded-xl font-label text-xs uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
