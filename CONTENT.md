# Coophile — Content Inventory

Every piece of user-facing text in the product, page by page, with the states
each screen can be in. This is the raw material for a design document: it says
*what* is on each screen and *why*, not how it should look.

Copy here is transcribed from the shipping code. Where text is generated at
runtime it is shown with `{placeholders}`.

- **Companion docs:** [README.md](README.md) explains how the system runs.
- **Suggested next doc:** `DESIGN.md` — layout, hierarchy, type scale, colour,
  component specs, responsive behaviour.

---

## 1. Voice and tone

The existing copy follows four rules. Worth keeping or deliberately changing —
either way a design doc should know them.

| Rule | Example |
|---|---|
| **Plain, not salesy.** No "revolutionary", no exclamation marks. | "Games hosted on this server. Pick one and play." |
| **Say the mechanism.** Users are technical; explaining builds trust. | "Gameplay traffic goes browser to browser — the server only introduces you." |
| **Errors state the cause and the fix.** Never "Something went wrong." | "Your ROMs differ. Different dumps of the same game will desync — swap to matching files." |
| **Legal points are stated once, plainly, without lecturing.** | "Emulators are legal. ROMs must be legally obtained." |

British-leaning spelling is used in newer copy (`licence`, `unrecognised`);
older copy uses US spelling. **This is inconsistent and worth settling.**

---

## 2. Product vocabulary

Terms that must stay consistent across the UI. Several are jargon that a design
pass may want to define on first use.

| Term | Means | Notes |
|---|---|---|
| **ROM** | The game file. | Assumed known. Never call it "the game data". |
| **Room** | A two-person netplay session. | Not "lobby", not "match". |
| **Room code** | 6 characters, e.g. `ZUK9BN`. | Excludes I, L, O, 0, 1 so it survives being read aloud. |
| **Host / guest** | Who created the room vs who joined. | The host makes the WebRTC offer. |
| **Peer** | The other player's browser. | Appears in connection status. |
| **Data channel** | The direct browser-to-browser link. | Jargon; currently unexplained in UI. |
| **Lockstep / desync** | Both emulators running identical inputs; falling out of step. | Jargon, appears in an error. |
| **Fingerprint** | SHA-256 of the ROM, shown truncated to 12 chars. | Users see hex like `63bd6fab9d6a`. |
| **Slot** | A catalog entry that may or may not have a ROM. | Used in admin. |

---

## 3. Page inventory

| Route | Purpose | Audience | Auth |
|---|---|---|---|
| `/` | Explain the product, route to library or netplay | Everyone | — |
| `/games` | Browse and launch hosted games | Players | — |
| `/play` | The emulator itself | Players | — |
| `/lobby` | Create or join a netplay room | Players | — |
| `/admin` | Manage the catalog and upload ROMs | Operator | Token |

---

## 4. Global elements

### Header (on `/games`, `/lobby`, `/admin`)
- Logo image + wordmark: **COOPHILE** — links to `/`
- Right-hand link varies: `Netplay lobby →` / `View library →` / `← Back`

### Footer (landing only)
> Coophile • Emulators are legal. ROMs must be legally obtained.

### Loading spinner
Used on every async page. No accompanying text except on `/play`.

### Sign-in gate
Renders over every page until the visitor signs in — including invite links,
which keep their URL so the room is waiting the moment sign-in completes.

Logo / **Sign in to Coophile** / "Play retro games with friends. Signing in keeps
your controls and your rooms tied to you." / `Continue with Google`
Footnote: "Emulator software is lawful; distributing copyrighted ROMs is not.
Whoever runs this server is responsible for its library."

Misconfigured server: 🔑 / **Sign-in is not configured** / "This server has no
Firebase credentials, so nobody can sign in. Set `FIREBASE_SERVICE_ACCOUNT` and
the `NEXT_PUBLIC_FIREBASE_*` values, then restart." / "See `.env.example` for the
full list."

---

## 5. Landing page — `/`

Single state. Five sections, in order.

### 5.1 Hero
| Element | Copy |
|---|---|
| Logo | Image, 128px |
| H1 | **COOPHILE** |
| Subtitle | Retro gaming, reimagined. Play classic games with friends, right in your browser. |
| Primary button | ▶ GAME LIBRARY → `/games` |
| Secondary button | ⚡ PLAY ONLINE → `/lobby` |

### 5.2 Supported Systems
Section heading: **SUPPORTED SYSTEMS**

| Name | Era | Icon |
|---|---|---|
| NES | 1983 | 🎮 |
| SNES | 1990 | 🕹️ |
| GBA | 2001 | 📱 |
| Genesis | 1988 | ⚡ |

> **Content issue:** these four are decorative and hardcoded. The emulator
> actually supports Game Boy, Game Boy Color and N64 as well. Either drive this
> from the real system list or drop the section.

### 5.3 How It Works
Section heading: **HOW IT WORKS**

| # | Title | Description | Icon |
|---|---|---|---|
| 01 | Add a ROM | Point us at a game file you own. It stays in your browser. | 📁 |
| 02 | Share Code | Get a unique room code and send it to a friend. | 🔗 |
| 03 | Play Together | Enjoy seamless low-latency netplay in real-time. | 👾 |

> **Content issue:** step 01 describes the one-off drop zone, but the primary
> path is now server-hosted games where the user adds nothing. Steps 01 and 03
> also contradict the tone rule — "seamless low-latency netplay in real-time" is
> the only marketing-voice sentence in the product.

### 5.4 One-off ROM drop zone
| Element | Copy |
|---|---|
| Heading | OR PLAY SOMETHING ONCE |
| Body | Drop in any ROM to play it straight away. Nothing is saved — use the **library** if you want it remembered. |
| Idle state | Drop your ROM file here / or click to browse |
| Drag-over state | Drop it like it's hot! |
| Format list | .nes • .smc • .sfc • .gba • .gb • .gbc |

> **Content issue:** "Drop it like it's hot!" is the only joke in the product and
> clashes with everything else. Flag for a voice decision.

---

## 6. Game library — `/games`

### 6.1 Page header
| Element | Copy |
|---|---|
| H1 | GAME LIBRARY |
| Intro | Games hosted on this server. Pick one and play — nothing to download or attach. |
| Counter | `{n}` / `{total}` ready to play |

### 6.2 Game card
Repeating unit. Two variants.

| Element | Copy / source |
|---|---|
| Artwork | Procedural, from the game's accent colour + emoji glyph |
| Title | `{title}` |
| Player badge | `{players}P` — only when co-op is simultaneous |
| Alt title | also known as "`{altTitle}`" — optional |
| Meta line | `{system} · {year} · {publisher}` |
| Description | `{blurb}` |
| Licence line | `{licence}` — links to source when one is recorded |

**Variant A — playable:**
- File line: `{size} · {fingerprint}`
- Buttons: `▶ Play` and `⚡` (netplay, simultaneous co-op only)

**Variant B — no ROM:**
- Notice: No ROM attached yet

### 6.3 Empty state
| Element | Copy |
|---|---|
| Icon | 📼 |
| Heading | The shelf is empty |
| Body | No games have been added yet. Add them from the admin panel, along with a record of where each one came from. |
| Action | Open admin → |

### 6.4 Footer note
Heading: ABOUT THIS LIBRARY

> Every game here carries a recorded source and licence, shown under its card.
> Only titles the operator holds distribution rights to belong on this shelf —
> homebrew, public domain, and self-owned material. In netplay, the ROM is
> fetched once per browser and only inputs cross the peer-to-peer link.

---

## 7. Emulator — `/play`

Four states.

### 7.1 Loading from library
Spinner + `Loading {title} from your library…`

### 7.2 Running
**Top bar:** logo · COOPHILE · `{game title}` · `⊞ Fullscreen` · `✕ Exit`

**Bottom bar:** `Mode: Solo` · `● Running` · `Controls: Arrow Keys + Z/X + Enter/Shift` · `Hide HUD`

When hidden, a single `Show HUD` button.

**Emulator overlays:**
- Loading: `Loading {system}...` / `Initializing emulator core`
- Failure: ⚠️ / `Failed to load emulator` / `{message}` / `Retry`

> **Content issue:** the controls hint is static text that does not reflect
> remapped keys, and it is hidden on small screens where it is needed most.

### 7.3 Game has no ROM
`{glyph}` / **No ROM for {title}** / "{title} is in the catalog but has no ROM attached yet. An admin needs to upload one." / `Open the library →`

### 7.4 Nothing loaded
🎮 / **No ROM Loaded** / "You need to upload a ROM file first. Head back to the home page to get started." / `← Back to Home`

Unknown game variant: **Game not found** / "That game is not in the catalog."

---

## 8. Netplay lobby — `/lobby`

The most state-heavy screen.

### 8.1 Header
| Element | Copy |
|---|---|
| H1 | NETPLAY LOBBY |
| Intro | Open a direct peer-to-peer link with a friend. Gameplay traffic goes browser to browser — the server only introduces you. |

### 8.2 Selected game banner
Shown when arriving from a game. Glyph · `{title}` · `{players}P {coop} · {year}` · `ROM {fingerprint}` or `no ROM attached`.

### 8.3 Mode choice
| Card | Heading | Body |
|---|---|---|
| 🎮 | Host a room | Get a code to share with a friend. |
| 🔗 | Join a room | Enter the code you were given. |

### 8.4 Join form
Label `ROOM CODE`, placeholder `ABC123`, max 6 chars, button `Join` / `Joining…`, back link `← Choose a different option`.

### 8.5 Host — sharing
| Element | Copy |
|---|---|
| Label | SHARE THIS CODE |
| Code | `{ABC123}` — large, monospace |
| Button | Copy invite link / ✓ Copied |
| Link text | `{full invite URL}` — always visible, selectable |
| Network hint | Share this address so it works on their machine: `{origin}` — They must be on the same network as you. |
| Copy blocked | Your browser blocked copying on an insecure page — select the link above and copy it manually. |
| Localhost warning | You are on localhost, which only means anything on this machine — an invite link built from it will open the other person's own computer, not yours. Put this machine on a network, or expose it with a tunnel, before inviting anyone. |

### 8.6 Connection progress
Heading `CONNECTION`, optional `{n} ms` readout. Four steps, each with a status dot and a detail value:

| Step | Detail values |
|---|---|
| Signaling server | idle / connecting / connected / closed |
| Room | `{code}` or waiting |
| Peer connection | new / connecting / connected / disconnected / failed / closed |
| Data channel | open / closed |

> **Content issue:** the detail column exposes raw internal state names. Useful
> when debugging, cryptic otherwise.

### 8.7 Connected panel
Heading: `● PEER CONNECTED`

**ROM match verdict** — one of five:

| State | Message |
|---|---|
| pending | Waiting for the other player to report their ROM… |
| different-game | Your opponent has `{other}` loaded, not `{title}`. |
| unknown | One of you has not attached a ROM for this game yet. |
| match | Both running the same dump of `{title}` (`{fingerprint}`). |
| mismatch | Your ROMs differ. Different dumps of the same game will desync — swap to matching files. |

**Chat:** empty prompt "Say something — this travels directly to the other browser." · input placeholder `Message your opponent…` · `Send`

**Footer note:** "The peer-to-peer link is live. Synchronised emulation over this channel is the next milestone — until then, load a ROM from the home page to play solo."

> **Content issue:** this admits the feature is unfinished. It needs rewriting or
> removing when lockstep lands.

### 8.8 Errors
Signaling: "Could not reach the signaling server at `{url}`"
Server-side: "No room with code `{CODE}`." · "That room is already full." · "Leave the current room first." · "That peer is not in this room."

---

## 9. Admin — `/admin`

### 9.1 Sign in
Handled by the site-wide gate — see §4. Reaching `/admin` while signed out shows
the same Google sign-in card as everywhere else.

### 9.2 Not an admin
🔒 / **Admins only** / "You are signed in as `{email}`, which is not on the admin allowlist."
/ "Add the address to `ADMIN_EMAILS` in the environment and restart, or sign in with an account that is already listed."
/ `Sign in with a different account`

### 9.3 Panel header
**ADMIN** · `{n} games in the catalog` · `View library →` · `Sign out`

### 9.4 Editor
Heading `Add a game` or `Edit "{title}"`, sub: "Pick the file from your computer, then fill in the details."

**Upload zone:**
- Idle: 💾 / "Drop a ROM from your computer, or click to browse" / "any supported ROM, or a .zip containing one — uploaded when you save"
- Dragging: 📥 / "Drop it here"
- Chosen: 💾 · `{filename}` · `{size}` · `remove`

**Required fields:** Title · System · Players
**Optional details** (collapsed) — "description, artwork, year, licence, source": Slug (URL id) · Also known as · Year · Publisher · Genre · Co-op mode · Licence · Source link · Cleared by · Accent · Glyph · Description

Placeholders: licence "WTFPL, public domain, my own cartridge…" · source "https://author.itch.io/game" · cleared by "your name"

**Confirmation checkbox:** "I have the right to distribute this game from this server." — blocks save until ticked.

**Actions:** `Add game` / `Save changes` / `Saving…` / `Cancel`

### 9.5 Catalog list
Empty: "Nothing yet. Add a game above, then attach its ROM."

Per row: artwork · `{title}` · `/{slug}` · `{system} · {players}P {coop} · {licence}` · file line or "no ROM attached"
Buttons: `Attach ROM` / `Replace ROM` · `Detach` · `Edit` · `Delete`
Delete confirm: "Delete `{title}` and its ROM?"

### 9.6 Success messages
"Game added." · "Game updated." · "Game saved and `{filename}` uploaded." · "ROM attached to `{title}`." · "ROM removed." · "Game deleted."

### 9.7 Upload rejections
- "`{title}` expects `{exts}` or a .zip — got `{ext}`."
- "No `{exts}` file inside that zip. It contains: `{names}`."
- "That zip holds more than one ROM (`{names}`). Upload the one you want on its own."
- "That zip is empty." · "That zip file could not be opened — it may be corrupt."
- "That ROM is larger than 64 MB once unpacked." · "Uploads above 64 MB are not accepted."

### 9.8 Database errors
"Cannot reach MongoDB. Start it with `npm run mongo`, or set `MONGODB_URI` to your own cluster."

---

## 10. Content questions for the design pass

1. **Spelling** — settle British vs US (`licence`/`license`).
2. **Emoji** — currently load-bearing (system icons, glyphs, status). Keep as a
   deliberate device or replace with an icon set?
3. **Jargon** — "data channel", "desync", "lockstep", "fingerprint" appear with
   no explanation. Define on first use, or accept the technical audience?
4. **Landing page accuracy** — Supported Systems and How It Works both describe
   an older version of the product (see §5.2, §5.3).
5. **Voice outliers** — "Drop it like it's hot!" and "seamless low-latency
   netplay in real-time" don't match the rest.
6. **Unfinished-feature copy** — the lobby footer note (§8.7) advertises that
   netplay is incomplete. Needs an owner.
7. **Empty and error states are currently text-only.** Decide whether they get
   illustration treatment.
8. **No dark/light choice** — the product is dark-only. Confirm that's intended.
