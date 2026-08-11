# Coophile

Browser-based retro emulation with peer-to-peer multiplayer. Pick a game from the
library, share a room code, and play together — gameplay traffic goes straight
between browsers, never through a server.

## How it works

Emulators are deterministic: the same ROM plus the same inputs from the same
starting state produces the same output every time. So instead of streaming
video between players, each browser runs its own emulator core and the peers
exchange only **inputs**.

```
Player A browser                            Player B browser
(WASM core + input capture)                 (WASM core + input capture)
        |                                            |
        \------- WebRTC data channel ----------------/
        |        (inputs, ~ms latency)               |
        \--------------\        /-------------------/
                        \      /
                        LiveKit room
                  Rooms, room codes, SDP/ICE relay
```

LiveKit only performs the introduction. Once the direct data channel is open it
is out of the loop entirely — gameplay inputs never touch it, so its latency
does not affect play.

## Running locally

```bash
./coophile setup    # creates .env.local, installs dependencies, checks the config
./coophile dev
```

`./coophile doctor` reports what is configured and what is still missing, and
`./coophile help` lists every command.

That is the whole system — database and web app — started in dependency order
and shut down together with Ctrl-C.

```
Coophile (development)
│ mongo  using remote database mongodb+srv://<credentials>@cluster0...
│ web    starting dev server

  Ready  http://localhost:3000
  admin  http://localhost:3000/admin
```

The database step is conditional. If `MONGODB_URI` points somewhere remote the
runner leaves it alone; if it points at this machine and nothing is listening, it
starts a local `mongod` (downloaded into a user cache — no Docker, no root) with
data persisted under `.mongo-data/`.

If a port is already taken the runner **refuses to start** rather than quietly
attaching to a server left over from a previous session, which otherwise leads to
testing stale code.

`npm start` runs the same stack against the production build (`npm run build`
first). The pieces can still be run on their own:

```bash
npm run dev:web   # Next.js only
npm run mongo     # local database only
```

## Signing in

Everyone signs in with Google before they can browse the shelf, play, or join a
netplay room. Create a Firebase project, enable the Google provider, and fill in
the `NEXT_PUBLIC_FIREBASE_*` values plus `FIREBASE_SERVICE_ACCOUNT` — the
comments in `.env.example` walk through where each one comes from.

Admins are named individually rather than sharing a password: list the Google
addresses allowed into `/admin` in `ADMIN_EMAILS`, comma-separated. An empty
list grants nobody, so set it before expecting the panel to open.

## Running in Docker

```bash
./coophile up              # build and start, using MongoDB Atlas
./coophile up --local-db   # also run MongoDB in a container
./coophile logs            # follow output
./coophile down            # stop
```

The image is a three-stage build on `output: "standalone"`, so it ships only the
dependencies actually reachable from the code and runs as an unprivileged user.
Cached ROMs live on a named volume, which keeps them across restarts.

One thing to be aware of: `NEXT_PUBLIC_*` values are compiled into the browser
bundle, so they are passed as **build args** and changing one needs a rebuild —
`./coophile up` rebuilds, `./coophile restart` does not. Everything secret (the
Mongo URI, the Firebase service account, the LiveKit secret) is supplied at run
time from `.env.local` and never enters the image.

If Docker reports a permission error, your user is not in the `docker` group.
`./coophile` will say so and print the fix.

## Deploying to a server

```bash
./deploy.sh user@host --dry-run   # show every step without running it
./deploy.sh user@host
```

The remote needs Docker with the compose v2 plugin and an account that can use
it; nothing else is installed on it. The script ships the committed tree at the
chosen ref with `git archive`, so a deploy never picks up stray local files —
and it checks up front that the ref actually contains the Dockerfile and friends
rather than letting the remote build fail minutes later.

`.env.local` travels separately, written straight to mode 600, and is never part
of the image. If the new container does not answer within 90 seconds the script
prints the logs and rolls back to the previous image.

Two things to sort out on the server side: the hostname must be listed under
Firebase Authentication → Settings → Authorized domains, and the site needs
https — Google refuses OAuth over plain http anywhere but localhost.

## The game library

Games live in MongoDB and are managed from `/admin`. The public shelf at
`/games` shows whatever the operator has added; ROM binaries are stored in
GridFS and streamed from `/api/games/<slug>/rom`, so players download nothing by
hand.

Uploads accept a bare ROM file or a **`.zip` containing one** — which is how
most ROMs arrive, itch.io downloads included. Archives are unpacked server-side:
a ROM nested in a folder is found, `__MACOSX` and dotfiles are skipped, and an
archive holding two ROMs is rejected rather than guessed at.

Each ROM is fingerprinted with SHA-256 **on the server** at upload time, after
any unpacking, so the hash is of the ROM and not of the container. Two zips of
identical bytes therefore agree. That matters: lockstep only stays
deterministic if both players run byte-identical files, so the lobby compares
fingerprints over the data channel before play starts.

### Provenance

Adding a game needs only a title and a system. Licence, source link, and who
cleared it are optional fields under **Optional details** — worth filling in,
because they are the only record of what the server is handing out, but they no
longer block an upload. The operator confirms their right to distribute with the
checkbox on the form.

That makes the admin panel suitable for homebrew, public domain, and material
you hold the rights to. It is not a hopper for commercial ROMs pulled off ROM
sites: hosting those makes the deployment a distribution point, which is what
gets emulator projects taken down.

## Trying multiplayer

1. Add a two-player game in `/admin` and attach its ROM. **Super Tilt Bro.**
   ([sgadrat.itch.io](https://sgadrat.itch.io/super-tilt-bro), WTFPL) is a good
   first pick — free, two-player, and explicitly redistributable.
2. From `/games`, hit ⚡ and choose **Host a room** — you get a six-character
   code and an invite link.
3. Open the invite link in a second browser. Both sides pull the same ROM from
   the server, so there is nothing for the other player to install.
4. Watch the four connection steps go green: LiveKit → room → peer → data
   channel. The chat box, latency readout, and ROM-match verdict confirm the
   link is live.

## Playing with someone else

The lobby shows the address to share. **Do not send a `localhost` link** — that
points at the other person's own computer, so they will never find your room.

**Same network (same WiFi):** share the address the lobby offers, e.g.
`http://192.168.1.33:3000/lobby?room=ABC123`. Only the app port (3000) needs to
be reachable, so check any local firewall.

Whichever address you share must also be listed under Firebase Authentication →
Settings → Authorized domains, or the guest cannot sign in.

**Different networks:** a LAN address will not reach them. Expose the machine
with a tunnel (`cloudflared tunnel --url http://localhost:3000`, `ngrok http
3000`, or similar) or deploy it, and add that hostname to the authorized domains
too.

Note that `NEXT_PUBLIC_*` values are baked in at build time, so change them
before `npm run build`.

On plain http the browser blocks clipboard access, so the invite link is always
shown as selectable text under the Copy button.

## Project layout

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | Landing page and ROM drop zone |
| `src/app/games/page.tsx` | Public game library, read from the API |
| `src/app/admin/page.tsx` | Admin panel — catalog CRUD and ROM uploads |
| `src/app/api/` | Public + admin route handlers |
| `src/app/play/page.tsx` | Solo emulator view |
| `src/app/lobby/page.tsx` | Room creation, joining, connection status |
| `src/lib/emulator/` | EmulatorJS wrapper, input capture, system definitions |
| `src/lib/games/` | Game schema, validation, Mongo repository, API client |
| `src/lib/db/` | MongoDB connection and GridFS bucket |
| `src/lib/auth/` | Firebase sign-in, session cookies, admin allowlist |
| `src/lib/net/` | LiveKit session, direct WebRTC peer, wire protocol |
| `coophile` | Control script — setup, dev, checks, Docker |
| `deploy.sh` | Deploy to a remote host over SSH, with rollback |
| `Dockerfile` | Three-stage production image on standalone output |
| `compose.yaml` | Web service, optional local MongoDB, ROM-cache volume |
| `server/dev.mjs` | One-command local runner (database + web app) |

## Status

- [x] **Solo emulation** — ROM loading, input mapping, save states
- [x] **Signaling + handshake** — LiveKit rooms, room codes, direct data channel
- [x] **Game library** — MongoDB catalog, admin panel, GridFS ROM hosting,
      server-side fingerprinting and ROM-match verification
- [ ] **Lockstep sync** — exchange inputs per frame, delay local rendering a few
      frames to absorb jitter, checksum RAM periodically to catch desyncs
- [ ] **UX polish** — reconnect handling, spectator mode
- [ ] **Rollback netcode** — only if lockstep's input delay does not feel good
      enough for fast-paced games

### Notes for the next step

The data channel is currently reliable and ordered, which is what lockstep
needs — a dropped input frame stalls both emulators. Rollback would flip this to
`{ordered: false, maxRetransmits: 0}` and carry redundant input history in each
packet instead; see `PeerConnectionOptions.channelConfig`.

`EmulatorEngine.getState()` / `setState()` wrap EmulatorJS save states, which are
how a desynced peer gets resynchronised.

## A note on ROMs

Emulator software is legal; distributing copyrighted ROMs is not.

Coophile ships with an empty catalog and hosts nothing of its own. Once you add
games through `/admin`, **your deployment is the distributor** — which is why
every entry has to carry a source, a licence, and an attestation, and why those
are enforced by the API rather than left to the form.

Homebrew, public domain, and material you hold the rights to are fine. Commercial
ROMs from ROM sites are not, however the panel is used.
# coophile
