#!/usr/bin/env bash
# Variant Studio 3.1 — installer and updater for Linux and macOS.
#
#   ./install.sh                         interactive: pick agents, remote sharing, scope and mode
#   ./install.sh --agents claude,codex   non-interactive
#   ./install.sh --detected --yes        every agent found on this machine
#   ./install.sh --all --yes             every supported agent, global scope
#   ./install.sh --project . --agents copilot,cline
#   ./install.sh --remote                also install cloudflared and enable remote sharing (--no-remote to turn it off)
#   ./install.sh --designer              also install DesignerSkill in the same agents (--no-designer to skip the question)
#   ./install.sh --link                  symlink instead of copy (updates with `git pull`)
#   ./install.sh --uninstall --agents claude
#   ./install.sh --list                  show agents and paths
#   ./install.sh --version 2.0           install a specific release (1.0, 2.0, 3.0, 3.1…) instead of the latest
#
# Running it again updates an existing install: the old files are replaced, your config files are kept.
#
# One-liner (downloads the latest main branch):
#   curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash
# A specific release:
#   curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash -s -- --version 2.0
set -euo pipefail

SKILL=variant-studio
REPO_TARBALL="https://codeload.github.com/Fonlogen/variant-studio/tar.gz/refs/heads/main"
USER_DIR="$HOME/.variant-studio"
CF_BASE="https://github.com/cloudflare/cloudflared/releases/latest/download"
DS_REPO="https://github.com/Kekko16004/DesignerSkill"
DS_DIR="$HOME/.designer/DesignerSkill"
# Variant Studio agent id -> DesignerSkill host id (agents DesignerSkill does not support are left out)
ds_host() { case "$1" in claude|codex|antigravity|kilo|cursor|opencode|copilot) printf '%s' "$1" ;; *) return 1 ;; esac; }

# id | name | global dir (relative to $HOME) | project dir | detection paths (relative to $HOME, ':' separated) | commands
# Claude Desktop has no skills folder: the installer builds a zip to upload in Settings > Capabilities.
AGENTS=(
  "claude|Claude Code|.claude/skills|.claude/skills|.claude|claude"
  "desktop|Claude Desktop|-|-|Library/Application Support/Claude:.config/Claude|"
  "codex|Codex|.agents/skills|.agents/skills|.codex|codex"
  "antigravity|Antigravity|.gemini/antigravity/skills|.agent/skills|.gemini/antigravity|antigravity:agy"
  "gemini|Gemini CLI|.gemini/skills|.gemini/skills|.gemini|gemini"
  "kilo|Kilo Code|.kilo/skills|.kilo/skills|.kilo:.kilocode|kilo:kilocode"
  "cline|Cline|.cline/skills|.cline/skills|.cline|cline"
  "opencode|OpenCode|.config/opencode/skills|.opencode/skills|.config/opencode|opencode"
  "cursor|Cursor|.cursor/skills|.cursor/skills|.cursor|cursor"
  "copilot|GitHub Copilot|.copilot/skills|.github/skills|.copilot|copilot"
  "grok|Grok Build|.grok/skills|.grok/skills|.grok|grok"
  "zcode|Z Code|.zcode/skills|.zcode/skills|.zcode|zcode"
)
DESKTOP_ZIP="$HOME/Downloads/$SKILL-skill.zip"

# ---------- output ----------
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; O=$'\033[38;5;208m'; G=$'\033[32m'; R=$'\033[31m'; N=$'\033[0m'; else B= D= O= G= R= N=; fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$O" "$N" "$*"; }
die()  { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
usage() { sed -n '2,22p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0; }

# ---------- args ----------
SEL=""; ALL=0; DET=0; YES=0; SCOPE=""; PROJECT=""; MODE=""; ACTION=install; LIST=0; VERSION=""; REMOTE=""; DESIGNER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --agents) SEL="${2:-}"; shift ;;
    --agents=*) SEL="${1#*=}" ;;
    --all) ALL=1 ;;
    --detected) DET=1 ;;
    -y|--yes) YES=1 ;;
    --global) SCOPE=global ;;
    --project) SCOPE=project; if [ -n "${2:-}" ] && [ "${2#-}" = "$2" ]; then PROJECT="$2"; shift; else PROJECT="$PWD"; fi ;;
    --project=*) SCOPE=project; PROJECT="${1#*=}" ;;
    --link) MODE=link ;;
    --copy) MODE=copy ;;
    --remote) REMOTE=yes ;;
    --no-remote) REMOTE=no ;;
    --designer) DESIGNER=yes ;;
    --no-designer) DESIGNER=no ;;
    --uninstall) ACTION=uninstall ;;
    --list) LIST=1 ;;
    --version) VERSION="${2:-}"; shift ;;
    --version=*) VERSION="${1#*=}" ;;
    -h|--help) usage ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done
if [ -n "$VERSION" ]; then
  VERSION="${VERSION#v}"
  case "$VERSION" in *[!0-9.]*|'') die "--version takes a release number like 2.0" ;; esac
  REPO_TARBALL="https://codeload.github.com/Fonlogen/variant-studio/tar.gz/refs/tags/v$VERSION"
fi

# interactive input works even when piped through `curl | bash`
TTY=""
if [ -t 0 ]; then TTY=/dev/stdin; elif [ -r /dev/tty ] && (: < /dev/tty) 2>/dev/null; then TTY=/dev/tty; fi
ask() { local __v; if [ -n "$TTY" ]; then IFS= read -r __v < "$TTY" || __v=""; else __v=""; fi; printf '%s' "$__v"; }
interactive() { [ "$YES" != 1 ] && [ -n "$TTY" ]; }

field() { printf '%s' "$1" | cut -d'|' -f"$2"; }
detected() {
  local entry="$1" p c
  IFS=':' read -r -a ps <<< "$(field "$entry" 5)"
  for p in "${ps[@]}"; do [ -n "$p" ] && [ -e "$HOME/$p" ] && return 0; done
  [ "$(field "$entry" 1)" = desktop ] && [ -d /Applications/Claude.app ] && return 0
  IFS=':' read -r -a cs <<< "$(field "$entry" 6)"
  for c in "${cs[@]}"; do [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 && return 0; done
  return 1
}
target_for() { # entry -> install dir (or the zip for Claude Desktop)
  if [ "$(field "$1" 1)" = desktop ]; then printf '%s' "$DESKTOP_ZIP"
  elif [ "$SCOPE" = project ]; then printf '%s/%s/%s' "$PROJECT" "$(field "$1" 4)" "$SKILL"
  else printf '%s/%s/%s' "$HOME" "$(field "$1" 3)" "$SKILL"; fi
}
version_of() { # skill dir -> version string, or empty
  [ -f "$1/scripts/studio.mjs" ] && sed -n "s/^const VERSION = '\([^']*\)'.*/\1/p" "$1/scripts/studio.mjs" | head -n1
}

if [ "$LIST" = 1 ]; then
  printf '%-12s %-16s %-34s %-22s %s\n' ID AGENT GLOBAL PROJECT DETECTED
  for e in "${AGENTS[@]}"; do
    d=no; detected "$e" && d=yes
    g="~/$(field "$e" 3)"; pr="$(field "$e" 4)"
    [ "$(field "$e" 1)" = desktop ] && { g="zip in ~/Downloads"; pr="-"; }
    printf '%-12s %-16s %-34s %-22s %s\n' "$(field "$e" 1)" "$(field "$e" 2)" "$g" "$pr" "$d"
  done
  exit 0
fi

say ""
say "${B}Variant Studio ${O}3.1${N}${B} installer${N}"
say "${D}Installs or updates the '$SKILL' skill in your coding agents.${N}"
say ""

# ---------- choose agents ----------
CHOSEN=()
if [ "$ALL" = 1 ]; then
  for i in "${!AGENTS[@]}"; do CHOSEN+=("$i"); done
elif [ "$DET" = 1 ]; then
  for i in "${!AGENTS[@]}"; do detected "${AGENTS[$i]}" && CHOSEN+=("$i"); done
elif [ -n "$SEL" ]; then
  IFS=',' read -r -a want <<< "$SEL"
  for w in "${want[@]}"; do
    w="$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"; found=""
    for i in "${!AGENTS[@]}"; do [ "$(field "${AGENTS[$i]}" 1)" = "$w" ] && found=$i; done
    [ -n "$found" ] || die "Unknown agent '$w'. Valid ids: $(for e in "${AGENTS[@]}"; do printf '%s ' "$(field "$e" 1)"; done)"
    CHOSEN+=("$found")
  done
else
  [ -n "$TTY" ] || die "No terminal for the interactive menu. Use --agents claude,codex, --detected or --all."
  PICK=()
  for i in "${!AGENTS[@]}"; do if detected "${AGENTS[$i]}"; then PICK[$i]=1; else PICK[$i]=0; fi; done
  while :; do
    say "${B}Select the agents${N} ${D}(detected ones are pre-selected)${N}"
    for i in "${!AGENTS[@]}"; do
      e="${AGENTS[$i]}"; mark=" "; [ "${PICK[$i]}" = 1 ] && mark="${O}x${N}"
      det=""; detected "$e" && det="${G}detected${N}"
      [ "$(field "$e" 1)" = desktop ] && det="$det ${D}(zip to upload)${N}"
      printf '  [%b] %2d  %-16s %b\n' "$mark" $((i + 1)) "$(field "$e" 2)" "$det"
    done
    printf '%s' "Numbers to toggle (e.g. 1 3), ${B}d${N}=detected only, ${B}a${N}=all, ${B}n${N}=none, ${B}Enter${N}=continue, ${B}q${N}=quit: "
    line="$(ask)"; say ""
    case "$line" in
      "") break ;;
      q|Q) exit 0 ;;
      a|A) for i in "${!AGENTS[@]}"; do PICK[$i]=1; done ;;
      n|N) for i in "${!AGENTS[@]}"; do PICK[$i]=0; done ;;
      d|D) for i in "${!AGENTS[@]}"; do if detected "${AGENTS[$i]}"; then PICK[$i]=1; else PICK[$i]=0; fi; done ;;
      *) for t in $(printf '%s' "$line" | tr ',' ' '); do
           case "$t" in ''|*[!0-9]*) warn "Ignored '$t'"; continue ;; esac
           j=$((t - 1)); [ "$j" -ge 0 ] && [ "$j" -lt "${#AGENTS[@]}" ] || { warn "No agent $t"; continue; }
           if [ "${PICK[$j]}" = 1 ]; then PICK[$j]=0; else PICK[$j]=1; fi
         done ;;
    esac
  done
  for i in "${!AGENTS[@]}"; do [ "${PICK[$i]}" = 1 ] && CHOSEN+=("$i"); done
fi
[ "${#CHOSEN[@]}" -gt 0 ] || die "No agent selected."
HAS_DIR=0
for i in "${CHOSEN[@]}"; do [ "$(field "${AGENTS[$i]}" 1)" != desktop ] && HAS_DIR=1; done

# ---------- scope + mode ----------
if [ "$HAS_DIR" = 1 ] && [ -z "$SCOPE" ]; then
  if ! interactive; then SCOPE=global
  else
    printf '%s' "Install ${B}g${N}lobally (all projects) or into a ${B}p${N}roject? [G/p]: "; a="$(ask)"
    case "$a" in p|P) SCOPE=project ;; *) SCOPE=global ;; esac
  fi
fi
SCOPE="${SCOPE:-global}"
if [ "$SCOPE" = project ] && [ -z "$PROJECT" ]; then
  printf '%s' "Project folder [${PWD}]: "; PROJECT="$(ask)"; PROJECT="${PROJECT:-$PWD}"
fi
if [ "$SCOPE" = project ]; then
  PROJECT="${PROJECT/#\~/$HOME}"
  [ -d "$PROJECT" ] || die "Project folder not found: $PROJECT"
  PROJECT="$(cd "$PROJECT" && pwd)"
fi

# ---------- remote sharing ----------
find_cloudflared() {
  local c
  for c in "$(command -v cloudflared 2>/dev/null || true)" "$USER_DIR/bin/cloudflared" /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared "$HOME/.local/bin/cloudflared"; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}
CF="$(find_cloudflared || true)"
if [ "$ACTION" = install ] && [ -z "$REMOTE" ]; then
  if ! interactive; then REMOTE=keep
  else
    say "${B}Remote sharing${N} ${D}lets teammates outside your network open a temporary link to the studio and vote.${N}"
    if [ -n "$CF" ]; then say "${D}It uses cloudflared, already installed at $CF.${N}"
    else say "${D}It needs cloudflared (Cloudflare's free tunnel client, about 40 MB, no account required).${N}"; fi
    printf '%s' "Enable remote sharing? [y/N]: "; a="$(ask)"
    case "$a" in y|Y|yes) REMOTE=yes ;; *) REMOTE=no ;; esac
    say ""
  fi
fi

# ---------- DesignerSkill ----------
DS_HOSTS=""
for i in "${CHOSEN[@]}"; do h="$(ds_host "$(field "${AGENTS[$i]}" 1)")" && DS_HOSTS="$DS_HOSTS${DS_HOSTS:+,}$h"; done
if [ "$ACTION" = install ] && [ -z "$DESIGNER" ]; then
  if ! interactive || [ -z "$DS_HOSTS" ]; then DESIGNER=no
  else
    say "${B}DesignerSkill${N} ${D}($DS_REPO) is a design skill made together with Variant Studio: it studies real${N}"
    say "${D}products, fixes the design tokens, shows directions in Variant Studio, checks and documents the result${N}"
    say "${D}and translates it to your stack. It installs into the same agents (${DS_HOSTS//,/, }).${N}"
    printf '%s' "Install DesignerSkill too? [y/N]: "; a="$(ask)"
    case "$a" in y|Y|yes) DESIGNER=yes ;; *) DESIGNER=no ;; esac
    say ""
  fi
fi

install_designer() {
  command -v node >/dev/null 2>&1 || { warn "DesignerSkill needs Node.js 18+ — skipped"; return 1; }
  [ -n "$DS_HOSTS" ] || { warn "DesignerSkill supports none of the chosen agents — skipped"; return 1; }
  mkdir -p "$(dirname "$DS_DIR")"
  if [ -d "$DS_DIR/.git" ] && command -v git >/dev/null 2>&1; then
    say "${D}Updating DesignerSkill…${N}"; git -C "$DS_DIR" pull -q --ff-only || warn "Could not update $DS_DIR; using it as is."
  elif [ -f "$DS_DIR/designer/install.sh" ]; then :
  elif command -v git >/dev/null 2>&1; then
    say "${D}Downloading DesignerSkill from GitHub…${N}"; git clone -q --depth 1 "$DS_REPO" "$DS_DIR" || return 1
  else
    say "${D}Downloading DesignerSkill from GitHub…${N}"; mkdir -p "$DS_DIR"
    curl -fsSL "https://codeload.github.com/Kekko16004/DesignerSkill/tar.gz/refs/heads/main" | tar -xz -C "$DS_DIR" --strip-components 1 || return 1
  fi
  [ -f "$DS_DIR/designer/install.sh" ] || return 1
  # DesignerSkill installs Variant Studio into the same agents too: hand it this very version, from a stable folder
  # (~/.variant-studio/app), so both installers agree and nothing is downloaded twice
  rm -rf "$USER_DIR/app"; copy_skill "$SRC" "$USER_DIR/app"
  bash "$DS_DIR/designer/install.sh" --hosts "$DS_HOSTS" --studio-path "$USER_DIR/app" --studio-mode copy </dev/null | sed 's/^/    /'
}

install_cloudflared() {
  local os arch url tmp
  if [ "$(uname -s)" = Darwin ] && command -v brew >/dev/null 2>&1; then
    say "${D}Installing cloudflared with Homebrew…${N}"
    brew install cloudflared >/dev/null 2>&1 && CF="$(find_cloudflared || true)" && [ -n "$CF" ] && return 0
    warn "Homebrew could not install cloudflared; downloading it instead."
  fi
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) return 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; armv7l|armv6l) arch=arm ;; i386|i686) arch=386 ;; *) return 1 ;; esac
  mkdir -p "$USER_DIR/bin"
  say "${D}Downloading cloudflared ($os-$arch) from GitHub…${N}"
  if [ "$os" = darwin ]; then
    url="$CF_BASE/cloudflared-darwin-$arch.tgz"; tmp="$(mktemp -d)"
    curl -fsSL "$url" | tar -xz -C "$tmp" && mv "$tmp/cloudflared" "$USER_DIR/bin/cloudflared"; rm -rf "$tmp"
  else
    url="$CF_BASE/cloudflared-linux-$arch"
    curl -fsSL -o "$USER_DIR/bin/cloudflared" "$url"
  fi
  [ -f "$USER_DIR/bin/cloudflared" ] || return 1
  chmod +x "$USER_DIR/bin/cloudflared"; CF="$USER_DIR/bin/cloudflared"
}

write_user_config() { # enabled cloudflared-path
  mkdir -p "$USER_DIR"
  if command -v node >/dev/null 2>&1; then
    VS_ENABLED="$1" VS_CF="$2" VS_FILE="$USER_DIR/config.json" node -e '
      const fs = require("fs"), f = process.env.VS_FILE;
      let c = {}; try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      c.remote = { ...(c.remote || {}), enabled: process.env.VS_ENABLED === "true" };
      if (process.env.VS_CF) c.remote.cloudflared = process.env.VS_CF; else delete c.remote.cloudflared;
      fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");'
  elif [ -n "$2" ]; then printf '{\n  "remote": { "enabled": %s, "cloudflared": "%s" }\n}\n' "$1" "$2" > "$USER_DIR/config.json"
  else printf '{\n  "remote": { "enabled": %s }\n}\n' "$1" > "$USER_DIR/config.json"; fi
}

# ---------- source ----------
HERE=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
TMP=""; KEEP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; [ -n "$KEEP" ] && rm -rf "$KEEP"; return 0; }
trap cleanup EXIT
if [ "$ACTION" = install ]; then
  if [ -z "$VERSION" ] && [ -n "$HERE" ] && [ -f "$HERE/SKILL.md" ] && [ -f "$HERE/scripts/studio.mjs" ]; then SRC="$HERE"
  else
    if [ -n "$VERSION" ]; then say "${D}Downloading Variant Studio $VERSION from GitHub…${N}"; else say "${D}Downloading the latest Variant Studio from GitHub…${N}"; fi
    TMP="$(mktemp -d)"
    if command -v curl >/dev/null 2>&1; then curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP" || die "Could not download ${VERSION:+version $VERSION }(is the release number right? See https://github.com/Fonlogen/variant-studio/releases)"
    elif command -v wget >/dev/null 2>&1; then wget -qO- "$REPO_TARBALL" | tar -xz -C "$TMP"
    else die "curl or wget is required to download the skill."; fi
    SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n1)"
    [ -f "$SRC/SKILL.md" ] || die "Download did not contain SKILL.md"
    if [ "$MODE" = link ]; then warn "--link needs a local clone; copying instead."; MODE=copy; fi
  fi
  if [ "$HAS_DIR" = 1 ] && [ -z "$MODE" ]; then
    if ! interactive || [ "$SRC" != "$HERE" ]; then MODE=copy
    else
      printf '%s' "${B}C${N}opy the files, or ${B}l${N}ink to this folder (stays updated with git pull)? [C/l]: "; a="$(ask)"
      case "$a" in l|L) MODE=link ;; *) MODE=copy ;; esac
    fi
  fi
  NEW_VER="$(version_of "$SRC")"
fi

# ---------- helpers ----------
is_ours() { # path is safe to replace/remove
  [ -L "$1" ] && return 0
  [ -f "$1/SKILL.md" ] && grep -q "^name: *$SKILL *$" "$1/SKILL.md"
}
copy_skill() { # src dst
  mkdir -p "$2"
  (cd "$1" && tar -cf - --exclude=.git --exclude=.variant-studio --exclude=node_modules --exclude=./.claude --exclude=./assets/screenshots --exclude=.DS_Store \
      --exclude=install.sh --exclude=install.ps1 --exclude=install.cmd .) | (cd "$2" && tar -xf -)
}
save_config() { # dst -> copies config.json, config.local.json and *.local.json aside, prints the folder
  local d; d="$(mktemp -d)"
  (cd "$1" && find . -maxdepth 2 -type f \( -name config.json -o -name '*.local.json' \) -print) 2>/dev/null | while IFS= read -r f; do
    mkdir -p "$d/$(dirname "$f")"; cp -p "$1/$f" "$d/$f"
  done
  printf '%s' "$d"
}
restore_config() { # saved dst
  (cd "$1" && find . -type f -print) | while IFS= read -r f; do mkdir -p "$2/$(dirname "$f")"; cp -p "$1/$f" "$2/$f"; done
}
make_zip() { # src zip
  local stage; stage="$(mktemp -d)"
  copy_skill "$1" "$stage/$SKILL"
  rm -f "$2"; mkdir -p "$(dirname "$2")"
  if command -v zip >/dev/null 2>&1; then (cd "$stage" && zip -qr "$2" "$SKILL")
  elif command -v ditto >/dev/null 2>&1; then ditto -c -k --keepParent "$stage/$SKILL" "$2"
  elif command -v python3 >/dev/null 2>&1; then (cd "$stage" && python3 -m zipfile -c "$2" "$SKILL")
  else rm -rf "$stage"; return 1; fi
  rm -rf "$stage"
}

# ---------- confirm ----------
say ""
if [ "$ACTION" = install ]; then VERB=Install; else VERB=Uninstall; fi
say "${B}${VERB}${N} ${D}(${SCOPE}${MODE:+, $MODE})${N}:"
for i in "${CHOSEN[@]}"; do
  e="${AGENTS[$i]}"; dst="$(target_for "$e")"; note=""
  if [ "$ACTION" = install ] && [ "$(field "$e" 1)" != desktop ] && is_ours "$dst" 2>/dev/null; then
    old="$(version_of "$dst")"; if [ -n "$old" ] && [ "$old" = "$NEW_VER" ]; then note="${D}reinstall $old${N}"; else note="${D}update ${old:-?} → ${NEW_VER:-?}${N}"; fi
  fi
  printf '  %-16s %s %b\n' "$(field "$e" 2)" "$dst" "$note"
done
if [ "$ACTION" = install ]; then
  case "$REMOTE" in
    yes) if [ -n "$CF" ]; then say "  ${D}Remote sharing: on (cloudflared at $CF)${N}"; else say "  ${D}Remote sharing: on, cloudflared will be installed${N}"; fi ;;
    no) say "  ${D}Remote sharing: off${N}" ;;
  esac
  [ "$DESIGNER" = yes ] && say "  ${D}DesignerSkill: ${DS_HOSTS//,/, } (global)${N}"
fi
if interactive; then
  printf '%s' "Proceed? [Y/n]: "; a="$(ask)"
  case "$a" in n|N) say "Cancelled."; exit 0 ;; esac
fi
say ""

# ---------- do it ----------
DONE=0; DESKTOP=0
for i in "${CHOSEN[@]}"; do
  e="${AGENTS[$i]}"; id="$(field "$e" 1)"; name="$(field "$e" 2)"; dst="$(target_for "$e")"
  if [ "$id" = desktop ]; then
    if [ "$ACTION" = uninstall ]; then
      rm -f "$DESKTOP_ZIP"; warn "$name: remove the skill in Settings > Capabilities"; continue
    fi
    if make_zip "$SRC" "$DESKTOP_ZIP"; then ok "$name: $DESKTOP_ZIP"; DESKTOP=1; DONE=$((DONE + 1))
    else warn "$name: zip, ditto or python3 is needed to build the zip — skipped"; fi
    continue
  fi
  if [ "$ACTION" = uninstall ]; then
    if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then warn "$name: not installed"; continue; fi
    is_ours "$dst" || { warn "$name: $dst is not Variant Studio, left untouched"; continue; }
    rm -rf "$dst"; ok "$name: removed $dst"; DONE=$((DONE + 1)); continue
  fi
  verb=""
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    if [ "$SRC" = "$dst" ] || { [ -d "$dst" ] && [ "$(cd "$dst" && pwd -P)" = "$(cd "$SRC" && pwd -P)" ]; }; then ok "$name: already this folder ($dst)"; DONE=$((DONE + 1)); continue; fi
    is_ours "$dst" || { warn "$name: $dst exists and is not Variant Studio — skipped"; continue; }
    old="$(version_of "$dst")"; if [ -n "$old" ] && [ "$old" = "$NEW_VER" ]; then verb="reinstalled $old"; else verb="updated ${old:-?} → ${NEW_VER:-?}"; fi
    # updater: keep the user's config files, replace everything else
    KEEP=""; [ -L "$dst" ] || KEEP="$(save_config "$dst")"
    rm -rf "$dst"
  fi
  mkdir -p "$(dirname "$dst")"
  if [ "$MODE" = link ]; then ln -s "$SRC" "$dst"; else copy_skill "$SRC" "$dst"; fi
  if [ -n "$KEEP" ]; then
    kept="$(cd "$KEEP" && find . -type f | wc -l | tr -d ' ')"
    if [ "$MODE" != link ] && [ "$kept" -gt 0 ]; then restore_config "$KEEP" "$dst"; verb="$verb, kept $kept config file(s)"; fi
    rm -rf "$KEEP"; KEEP=""
  fi
  ok "$name: $dst${verb:+ ${D}($verb)${N}}"; DONE=$((DONE + 1))
done

say ""
if [ "$ACTION" = install ]; then
  if command -v node >/dev/null 2>&1; then
    v="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$v" -lt 18 ]; then warn "Node.js $(node -v) found; Variant Studio needs Node 18 or newer."; else ok "Node.js $(node -v)"; fi
  else
    warn "Node.js not found. Install Node 18+ (https://nodejs.org) — the studio server runs on Node."
  fi
  case "$REMOTE" in
    yes)
      if [ -z "$CF" ]; then install_cloudflared || true; fi
      if [ -n "$CF" ]; then write_user_config true "$CF"; ok "Remote sharing on (cloudflared: $CF)"
      else write_user_config true ""; warn "Could not install cloudflared. Install it yourself (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and remote sharing will work."; fi ;;
    no) write_user_config false "$CF"; ok "Remote sharing off ${D}(re-run with --remote to turn it on)${N}" ;;
  esac
  if [ "$DESIGNER" = yes ]; then
    say ""; say "${B}DesignerSkill${N}"
    if install_designer; then ok "DesignerSkill installed for ${DS_HOSTS//,/, } ${D}(update later: $DS_DIR/update.sh)${N}"
    else warn "DesignerSkill was not installed. Get it from $DS_REPO"; fi
  fi
  say ""
  say "${B}Done.${N} Installed for $DONE agent(s). Restart the agent, then ask for design variants"
  say "(e.g. \"show me 3 versions of the pricing card\") or invoke the skill by name: ${O}$SKILL${N}."
  if [ "$DESKTOP" = 1 ]; then
    say ""
    say "${B}Claude Desktop:${N} open Settings > Capabilities > Skills, choose ${B}Upload skill${N} and pick"
    say "  $DESKTOP_ZIP"
    say "${D}Desktop chats run in a sandbox, so the studio opens as a single HTML file there (build). In the Code tab of${N}"
    say "${D}Claude Desktop the live studio works like in Claude Code: install for 'Claude Code' too.${N}"
  fi
else
  say "${B}Done.${N} Removed from $DONE agent(s)."
fi
