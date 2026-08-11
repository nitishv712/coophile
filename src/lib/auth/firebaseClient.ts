'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';

/**
 * Firebase client, initialised from environment.
 *
 * Every value here is public by design — Firebase web config is not a secret,
 * access is governed by security rules and by the server verifying ID tokens.
 * The one thing that must never appear here is the service-account key, which
 * stays server-side in `firebaseAdmin.ts`.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Whether sign-in can work at all. Checked before rendering the gate so an
 * unconfigured deployment shows setup instructions rather than an opaque
 * Firebase error — the app is otherwise completely unusable when auth is
 * required and misconfigured.
 */
export function isAuthConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

let app: FirebaseApp | null = null;

function firebaseApp(): FirebaseApp {
  if (!isAuthConfigured()) {
    throw new Error('Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* variables.');
  }
  if (!app) {
    // Next's dev refresh re-runs modules; reuse the app rather than duplicating.
    app = getApps().length ? getApp() : initializeApp(config as Required<typeof config>);
  }
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

/** Sign in with Google and hand the resulting ID token to our own server. */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  // Always show the chooser: on a shared machine, silently reusing the last
  // Google account is a surprising way to end up signed in as someone else.
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(firebaseAuth(), provider);
  await establishSession(await credential.user.getIdToken());
  return credential.user;
}

/**
 * Exchange a Firebase ID token for an httpOnly session cookie.
 *
 * The client SDK keeps its own token in browser storage, but route handlers
 * cannot read that. A server-set cookie is what lets the API authenticate
 * requests, and being httpOnly keeps it out of reach of page scripts.
 */
export async function establishSession(idToken: string): Promise<void> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Could not start a session.');
  }
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  if (isAuthConfigured()) await firebaseSignOut(firebaseAuth());
}
