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
                  Signaling server (Node.js + ws)
                  Rooms, room codes, SDP/ICE relay
```

The signaling server only performs the introduction. Once the data channel is
open it is out of the loop entirely — killing it mid-session does not interrupt
a connected game.

## Running locally

```bash
npm install
cp .env.example .env.local   # then set MONGODB_URI and ADMIN_TOKEN
npm run dev
```

That is the whole system — database, signaling server, and web app — started in
dependency order and shut down together with Ctrl-C.

```
Coophile (development)
│ mongo  using remote database mongodb+srv://<credentials>@cluster0...
│ signal starting on port 3001
│ signal ready
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
npm run signal    # signaling server only
npm run mongo     # local database only
```

Set `ADMIN_TOKEN` to enable `/admin`. With it unset, admin is disabled outright
in production and falls back to the token `dev` locally. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

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
4. Watch the four connection steps go green: signaling → room → peer → data
   channel. The chat box, latency readout, and ROM-match verdict confirm the
   link is live.

## Playing with someone else

The lobby shows the address to share. **Do not send a `localhost` link** — that
points at the other person's own computer, so they will never find your room.

**Same network (same WiFi):** share the address the lobby offers, e.g.
`http://192.168.1.33:3000/lobby?room=ABC123`. Both the app port (3000) and the
signaling port (3001) must be reachable, so check any local firewall.

**Different networks:** a LAN address will not reach them. Expose the machine
with a tunnel (`cloudflared tunnel --url http://localhost:3000`, `ngrok http
3000`, or similar) or deploy it, then set `NEXT_PUBLIC_SIGNALING_URL` so the
browser knows where signaling lives — the default guesses port 3001 on the
current hostname, which a tunnel will not forward.

Note that `NEXT_PUBLIC_*` values are baked in at build time, so change it before
`npm run build`.

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
| `src/lib/auth/` | Admin token and session handling |
| `src/lib/net/` | Signaling client, WebRTC peer, netplay session |
| `server/signaling.mjs` | Standalone signaling server (no build step) |

The signaling server is plain `.mjs` so it can be deployed on its own. Its wire
protocol is mirrored in `src/lib/net/protocol.ts` — keep the two in sync by hand.

## Status

- [x] **Solo emulation** — ROM loading, input mapping, save states
- [x] **Signaling + handshake** — rooms, room codes, WebRTC data channel
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
