#!/usr/bin/env node
/**
 * Runs the whole Coophile stack with one command: database, signaling server,
 * and web app, started in dependency order and shut down together.
 *
 *   npm run dev          development (hot reload)
 *   npm run dev -- --prod   production build output
 *
 * The database step is conditional. If MONGODB_URI points somewhere remote
 * (Atlas, for example) nothing is started locally; if it points at this machine
 * and nothing is listening yet, a local mongod is launched.
 */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
// @next/env is CommonJS, so it has no ESM named exports.
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();

// Read .env.local the same way Next.js will, so the URI decided here is the
// one the app actually connects with.
loadEnvConfig(projectDir, true, { info: () => {}, error: () => {} });

const production = process.argv.includes('--prod');
const WEB_PORT = Number(process.env.PORT ?? 3000);
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';

// ── Output ───────────────────────────────────────────────────────

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `[${code}m${text}[0m` : text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);

const LABELS = {
  mongo: '32', // green
  web: '36', // cyan
  run: '33', // yellow
};

function say(label, message) {
  const tag = paint(LABELS[label] ?? '37', label.padEnd(6));
  process.stdout.write(`${dim('│')} ${tag} ${message}\n`);
}

/** Forward a child's output with the same prefix, dropping blank noise. */
function pipeOutput(label, child) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) say(label, line);
      }
    });
  }
}

// ── Process management ───────────────────────────────────────────

const children = [];
let shuttingDown = false;

function start(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: projectDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group, so shutdown reaches grandchildren too. Without this a
    // killed wrapper leaves the real server running and holding its port.
    detached: true,
  });

  pipeOutput(label, child);
  children.push({ label, child });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    say(label, bold(`exited (${signal ?? `code ${code}`}) — stopping everything`));
    shutdown(code ?? 1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${dim('│')} ${paint('33', 'run   ')} shutting down\n`);

  for (const { child } of children) {
    try {
      // Negative pid targets the whole group.
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already gone.
      }
    }
  }

  setTimeout(() => process.exit(exitCode), 600).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

// ── Readiness helpers ────────────────────────────────────────────

function tcpOpen(port, host = '127.0.0.1', timeout = 700) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitFor(name, probe, attempts = 150, gap = 200) {
  for (let i = 0; i < attempts; i++) {
    if (await probe()) return true;
    await new Promise((r) => setTimeout(r, gap));
  }
  throw new Error(`${name} did not become ready in time`);
}

async function httpOk(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Local host+port if the URI points at this machine, otherwise null. */
function localMongoTarget(uri) {
  if (uri.startsWith('mongodb+srv://')) return null;
  try {
    const parsed = new URL(uri);
    const host = parsed.hostname;
    const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    return isLocal ? { host: '127.0.0.1', port: Number(parsed.port || 27017) } : null;
  } catch {
    return null;
  }
}

// ── Startup ──────────────────────────────────────────────────────

async function main() {
  process.stdout.write(
    `\n${bold('Coophile')} ${dim(production ? '(production)' : '(development)')}\n`,
  );

  // Refuse to start on an occupied port. Silently attaching to a stale server
  // from a previous run is worse than failing: you end up testing old code.
  if (await tcpOpen(WEB_PORT)) {
    process.stderr.write(
      `\n${bold('Port ' + WEB_PORT + ' is already in use')} (needed for the web app).\n` +
        `Something is still running — probably a previous session.\n\n` +
        `  Find it:  lsof -i :${WEB_PORT}    (or: ss -lptn 'sport = :${WEB_PORT}')\n` +
        `  Stop it:  pkill -f next-server\n\n`,
    );
    process.exit(1);
  }

  // ── Database ───────────────────────────────────────────────────
  const local = localMongoTarget(MONGODB_URI);
  if (!local) {
    const host = MONGODB_URI.replace(/\/\/[^@]*@/, '//<credentials>@').slice(0, 60);
    say('mongo', `using remote database ${dim(host)}`);
  } else if (await tcpOpen(local.port, local.host)) {
    say('mongo', `already running on port ${local.port}`);
  } else {
    say('mongo', `starting local database on port ${local.port}`);
    start('mongo', process.execPath, ['server/local-mongo.mjs']);
    await waitFor('MongoDB', () => tcpOpen(local.port, local.host));
    say('mongo', 'ready');
  }

  // LiveKit handles signaling — no local server to start.

  // ── Web ────────────────────────────────────────────────────────
  const nextBin = 'node_modules/next/dist/bin/next';
  say('web', `starting ${production ? 'production server' : 'dev server'}`);
  start('web', process.execPath, [nextBin, production ? 'start' : 'dev', '-p', String(WEB_PORT)]);
  await waitFor('web app', () => httpOk(`http://127.0.0.1:${WEB_PORT}`));

  process.stdout.write(
    `\n  ${bold('Ready')}  ${paint('36', `http://localhost:${WEB_PORT}`)}\n` +
      `  ${dim(`admin  http://localhost:${WEB_PORT}/admin`)}\n` +
      `  ${dim('Ctrl-C stops everything')}\n\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`\n${bold('Failed to start:')} ${error.message}\n\n`);
  shutdown(1);
});
