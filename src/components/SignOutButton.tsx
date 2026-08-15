"use client";

import { useAuth } from "./AuthProvider";

/** Sign-out control for server-rendered pages that have nothing else on the client. */
export default function SignOutButton({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { signOut } = useAuth();
  return (
    <button id={id} onClick={() => void signOut()} className={className}>
      {children}
    </button>
  );
}
