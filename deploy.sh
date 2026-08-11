#!/usr/bin/env bash
#
# Deploy Coophile to a remote host over SSH.
#
#   ./deploy.sh user@host
#   ./deploy.sh user@host --dry-run       show every command without running it
#   ./deploy.sh --help
#
# What it does, in order: check the local config, verify the remote can build,
# ship the working tree (tracked files only), install the secrets separately
# with tight permissions, rebuild the image, restart, and wait for the health
# check to pass. If the new container does not come up healthy it rolls back to
# the previous image rather than leaving the site down.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=".env.local"
REMOTE_PATH_DEFAULT="/opt/coophile"
HEALTH_TIMEOUT=90

# ── Output ───────────────────────────────────────────────────────

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

step()  { printf '\n%s\n' "${BLUE}${BOLD}==>${RESET} ${BOLD}$*${RESET}"; }
say()   { printf '%s\n' "${DIM}   │${RESET} $*"; }
ok()    { printf '%s\n' "   ${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "   ${YELLOW}!${RESET} $*" >&2; }
die()   { printf '\n%s\n' "${RED}✗${RESET} $*" >&2; exit 1; }

usage() {
  cat <<EOF
${BOLD}deploy.sh${RESET} — deploy Coophile to a remote host

${BOLD}USAGE${RESET}
  ./deploy.sh <user@host> [options]

${BOLD}OPTIONS${RESET}
  --path <dir>     Where to install on the remote (default: $REMOTE_PATH_DEFAULT)
  --port <n>       Host port to publish (default: 3000)
  --ssh-port <n>   SSH port (default: 22)
  --branch <ref>   Git ref to deploy (default: current HEAD)
  --dry-run        Print every command instead of running it
  --yes            Skip the confirmation prompt
  --no-rollback    Leave a failed deploy in place instead of reverting
  -h, --help       This message

${BOLD}EXAMPLES${RESET}
  ./deploy.sh root@203.0.113.10
  ./deploy.sh deploy@myserver --path /srv/coophile --port 8080
  ./deploy.sh root@203.0.113.10 --dry-run

${BOLD}REQUIREMENTS${RESET}
  Local:   git, ssh, rsync, a filled-in $ENV_FILE
  Remote:  docker with the compose v2 plugin, and an account that can use it

${BOLD}AFTER DEPLOYING${RESET}
  Add the deployed hostname to Firebase Authentication → Settings → Authorized
  domains, or nobody will be able to sign in. Google also refuses OAuth on
  plain http for anything but localhost, so put the site behind https.
EOF
}

# ── Arguments ────────────────────────────────────────────────────

TARGET=""
REMOTE_PATH="$REMOTE_PATH_DEFAULT"
APP_PORT=""
SSH_PORT="22"
GIT_REF="HEAD"
DRY_RUN=0
ASSUME_YES=0
ROLLBACK=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --path)        REMOTE_PATH="${2:?--path needs a directory}"; shift 2 ;;
    --port)        APP_PORT="${2:?--port needs a number}"; shift 2 ;;
    --ssh-port)    SSH_PORT="${2:?--ssh-port needs a number}"; shift 2 ;;
    --branch|--ref) GIT_REF="${2:?--branch needs a ref}"; shift 2 ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    --no-rollback) ROLLBACK=0; shift ;;
    -h|--help)     usage; exit 0 ;;
    -*)            die "Unknown option: $1 (try --help)" ;;
    *)
      [[ -z "$TARGET" ]] || die "Only one target host, got '$TARGET' and '$1'."
      TARGET="$1"; shift ;;
  esac
done

[[ -n "$TARGET" ]] || { usage >&2; die "No target host given."; }
[[ "$TARGET" == *"@"* ]] || warn "Target has no user part; ssh will use '$USER'."

SSH=(ssh -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 "$TARGET")

# Runs a command on the remote — or prints it, under --dry-run.
remote() {
  if (( DRY_RUN )); then
    printf '%s\n' "   ${DIM}ssh $TARGET${RESET} $*"
    return 0
  fi
  "${SSH[@]}" "$@"
}

# Same, for local commands with side effects.
run() {
  if (( DRY_RUN )); then
    printf '%s\n' "   ${DIM}local${RESET} $*"
    return 0
  fi
  "$@"
}

# ── 1. Local preflight ───────────────────────────────────────────

step "Checking the local side"

for tool in git ssh rsync; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."
done
ok "git, ssh, rsync present"

[[ -f "$ENV_FILE" ]] || die "No $ENV_FILE — run './coophile setup' and fill it in."

env_value() {
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1 | sed 's/^"//; s/"$//'
}

missing=()
for key in MONGODB_URI NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
           NEXT_PUBLIC_FIREBASE_PROJECT_ID FIREBASE_SERVICE_ACCOUNT ADMIN_EMAILS; do
  [[ -n "$(env_value "$key")" ]] || missing+=("$key")
done
if (( ${#missing[@]} )); then
  warn "These are empty in $ENV_FILE:"
  for key in "${missing[@]}"; do warn "  $key"; done
  die "Fill them in before deploying — the site will not work without them."
fi
ok "required configuration present"

# A localhost database URI is the single most common thing to get wrong here:
# it works on the laptop and silently means "the container itself" on the server.
uri="$(env_value MONGODB_URI)"
if [[ "$uri" == *"127.0.0.1"* || "$uri" == *"localhost"* ]]; then
  die "MONGODB_URI points at localhost, which on the server means the container
   itself. Use an Atlas URI, or 'mongodb://mongo:27017' with a local-db profile."
fi
ok "MONGODB_URI is not local"

git rev-parse --git-dir >/dev/null 2>&1 || die "Not a git repository."
git rev-parse --verify "$GIT_REF" >/dev/null 2>&1 || die "No such git ref: $GIT_REF"

# Only committed files are shipped, so anything the remote build needs has to
# exist *in the ref* — not merely on disk. Without this check a fresh setup
# fails minutes later on the server with an opaque "COPY failed", which is a
# miserable way to find out the Dockerfile was never committed.
needed=(Dockerfile compose.yaml .dockerignore package.json package-lock.json next.config.ts public)
absent=()
for path in "${needed[@]}"; do
  git cat-file -e "$GIT_REF:$path" 2>/dev/null || absent+=("$path")
done
if (( ${#absent[@]} )); then
  warn "These are missing from '$GIT_REF' and the remote build needs them:"
  for path in "${absent[@]}"; do warn "  $path"; done
  die "Commit them first:  git add ${absent[*]} && git commit"
fi
ok "the ref contains everything the build needs"

if [[ -n "$(git status --porcelain)" ]]; then
  warn "Working tree has uncommitted changes — only committed files are deployed."
fi

COMMIT="$(git rev-parse --short "$GIT_REF")"
APP_PORT="${APP_PORT:-$(env_value PORT)}"
APP_PORT="${APP_PORT:-3000}"
ok "deploying ${BOLD}$COMMIT${RESET} to ${BOLD}$TARGET:$REMOTE_PATH${RESET} on port $APP_PORT"

# ── 2. Confirm ───────────────────────────────────────────────────

if (( ! ASSUME_YES && ! DRY_RUN )); then
  echo
  printf '%s' "Deploy $COMMIT to ${BOLD}$TARGET${RESET}? [y/N] "
  read -r reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }
fi

# ── 3. Remote preflight ──────────────────────────────────────────

step "Checking the remote host"

if (( DRY_RUN )); then
  say "${DIM}(skipped under --dry-run)${RESET}"
else
  "${SSH[@]}" true 2>/dev/null \
    || die "Cannot ssh to $TARGET. Is your key installed, and is BatchMode viable?"
  ok "ssh works"

  remote "command -v docker >/dev/null 2>&1" \
    || die "docker is not installed on $TARGET."
  remote "docker compose version >/dev/null 2>&1" \
    || die "The docker compose v2 plugin is missing on $TARGET."
  remote "docker info >/dev/null 2>&1" \
    || die "The remote account cannot use the Docker daemon (group membership?)."
  ok "docker and compose usable"
fi

# ── 4. Ship the code ─────────────────────────────────────────────

step "Shipping code"

remote "mkdir -p '$REMOTE_PATH'"

# git archive rather than rsync of the working tree: it takes exactly what is
# committed at the chosen ref, so a deploy cannot pick up a stray local file.
if (( DRY_RUN )); then
  say "${DIM}local${RESET} git archive $GIT_REF | ssh $TARGET tar -x -C $REMOTE_PATH"
else
  git archive --format=tar "$GIT_REF" \
    | "${SSH[@]}" "tar -x -C '$REMOTE_PATH'"
fi
ok "working tree at $COMMIT extracted to $REMOTE_PATH"

# ── 5. Install secrets ───────────────────────────────────────────

step "Installing configuration"

# Deliberately not part of the archive — .env.local is gitignored, and secrets
# should not travel inside anything that might get cached or copied onward.
# Written 600 and owned by the deploying account before any content lands.
if (( DRY_RUN )); then
  say "${DIM}local${RESET} scp $ENV_FILE → $TARGET:$REMOTE_PATH/.env.local (mode 600)"
else
  remote "install -m 600 /dev/null '$REMOTE_PATH/.env.local'"
  "${SSH[@]}" "cat > '$REMOTE_PATH/.env.local'" < "$ENV_FILE"
  remote "chmod 600 '$REMOTE_PATH/.env.local'"
fi
ok ".env.local installed with mode 600"

# ── 6. Build and restart ─────────────────────────────────────────

step "Building and restarting"

# Tag the currently-running image so a failed rollout has something to go back to.
if (( ROLLBACK )); then
  remote "docker image inspect coophile:local >/dev/null 2>&1 \
          && docker tag coophile:local coophile:previous || true"
fi

compose_cmd="cd '$REMOTE_PATH' && PORT='$APP_PORT' docker compose --env-file .env.local -p coophile"

say "building image (this takes a few minutes the first time)"
remote "$compose_cmd build"
ok "image built"

remote "$compose_cmd up -d --remove-orphans"
ok "container started"

# ── 7. Health check ──────────────────────────────────────────────

step "Waiting for the app to answer"

if (( DRY_RUN )); then
  say "${DIM}ssh $TARGET${RESET} poll http://127.0.0.1:$APP_PORT/api/auth/session for ${HEALTH_TIMEOUT}s"
  ok "${DIM}(skipped under --dry-run)${RESET}"
else
  healthy=0
  for (( waited = 0; waited < HEALTH_TIMEOUT; waited += 3 )); do
    if "${SSH[@]}" "curl -fsS -o /dev/null 'http://127.0.0.1:$APP_PORT/api/auth/session'" 2>/dev/null; then
      healthy=1
      break
    fi
    sleep 3
    printf '%s' "."
  done
  echo

  if (( healthy )); then
    ok "responding on port $APP_PORT"
  else
    warn "No healthy response after ${HEALTH_TIMEOUT}s. Recent logs:"
    "${SSH[@]}" "$compose_cmd logs --tail=40 web" 2>&1 | sed 's/^/   /' || true

    if (( ROLLBACK )); then
      step "Rolling back"
      if "${SSH[@]}" "docker image inspect coophile:previous >/dev/null 2>&1"; then
        remote "docker tag coophile:previous coophile:local && $compose_cmd up -d"
        warn "Reverted to the previous image. The bad build was not kept."
      else
        warn "No previous image to roll back to — this looks like a first deploy."
      fi
    fi
    die "Deploy failed."
  fi
fi

# ── 8. Done ──────────────────────────────────────────────────────

step "Deployed"

host="${TARGET#*@}"
ok "${BOLD}$COMMIT${RESET} is live on ${BOLD}http://$host:$APP_PORT${RESET}"
echo
say "logs     ssh $TARGET \"$compose_cmd logs -f web\""
say "restart  ssh $TARGET \"$compose_cmd restart web\""
say "stop     ssh $TARGET \"$compose_cmd down\""
echo
warn "Sign-in will fail until '$host' is listed under Firebase Authentication →"
warn "Settings → Authorized domains. Google also refuses OAuth over plain http"
warn "outside localhost, so serve this behind https before sharing it."
