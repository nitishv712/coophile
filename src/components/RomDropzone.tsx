"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-off ROM drop on the landing page.
 *
 * The file never leaves the browser: it becomes a blob URL handed to /play
 * through sessionStorage, which is why this has to be a Client Component while
 * the rest of the page is rendered on the server.
 */

function detectSystem(ext: string | undefined): string {
  switch (ext) {
    case "nes":
      return "nes";
    case "smc":
    case "sfc":
      return "snes";
    case "gba":
      return "gba";
    case "gb":
      return "gb";
    case "gbc":
      return "gbc";
    case "bin":
    case "gen":
    case "md":
      return "genesis";
    default:
      return "";
  }
}

export default function RomDropzone() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const system = detectSystem(ext);

      if (!system) {
        setError(
          `Coophile does not recognise “.${ext ?? "?"}”. Supported: .nes, .smc, .sfc, .gba, .gb, .gbc.`,
        );
        return;
      }

      setError(null);
      const blobUrl = URL.createObjectURL(file);
      sessionStorage.setItem("coophile_rom_url", blobUrl);
      sessionStorage.setItem("coophile_rom_name", file.name);
      router.push(`/play?system=${system}`);
    },
    [router],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <>
      {error && (
        <div
          id="dropzone-error"
          className="mb-6 max-w-2xl mx-auto rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm text-center"
        >
          {error}
        </div>
      )}

      <div
        id="rom-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-3xl p-12 sm:p-16 text-center cursor-pointer transition-all duration-300 group ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-outline-variant/40 bg-surface-container-lowest hover:border-primary hover:bg-surface-container-low/50"
        }`}
      >
        <input
          type="file"
          id="hidden-file-input"
          ref={fileInputRef}
          className="hidden"
          accept=".nes,.smc,.sfc,.gba,.gb,.gbc,.bin,.gen,.md"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = "";
          }}
        />

        <span
          className={`material-symbols-outlined text-6xl mb-6 transition-colors ${
            isDragging ? "text-primary" : "text-on-surface-variant/40 group-hover:text-primary"
          }`}
        >
          upload_file
        </span>
        <h3 className="font-label tracking-widest uppercase text-sm mb-4 text-on-surface font-semibold">
          {isDragging ? "Drop it here" : "Or play something once"}
        </h3>
        <p className="font-body text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Drop in any ROM to play it straight away. Nothing is saved — use the{" "}
          <Link href="/games" className="text-primary underline underline-offset-4">
            library
          </Link>{" "}
          if you want it remembered.
        </p>
      </div>
    </>
  );
}
