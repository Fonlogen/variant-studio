#!/usr/bin/env bash
# Variant Studio 2.0 — installer for Linux and macOS.
#
#   ./install.sh                         interactive: pick agents, scope and mode
#   ./install.sh --agents claude,codex   non-interactive
#   ./install.sh --all --yes             every supported agent, global scope
#   ./install.sh --project . --agents copilot,cline
#   ./install.sh --link                  symlink instead of copy (updates with `git pull`)
#   ./install.sh --uninstall --agents claude
#   ./install.sh --list                  show agents and paths
#
# One-liner (downloads the latest main branch):
#   curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash
set -euo pipefail

SKILL=variant-studio
REPO_TARBALL="https://codeload.github.com/Fonlogen/variant-studio/tar.gz/refs/heads/main"

# id | name | global dir (relative to $HOME) | project dir | detection paths (relative to $HOME, ':' separated) | commands
AGENTS=(
  "claude|Claude Code|.claude/skills|.claude/skills|.claude|claude"
  "codex|Codex|.agents/skills|.agents/skills|.codex|codex"
  "kilo|Kilo Code|.kilo/skills|.kilo/skills|.kilo:.kilocode|kilo:kilocode"
  "antigravity|Antigravity|.gemini/antigravity/skills|.agent/skills|.gemini/antigravity|antigravity:agy"
  "gemini|Gemini CLI|.gemini/skills|.gemini/skills|.gemini|gemini"
  "cline|Cline|.cline/skills|.cline/skills|.cline|cline"
  "copilot|GitHub Copilot|.copilot/skills|.github/skills|.copilot|copilot"
  "grok|Grok Build|.grok/skills|.grok/skills|.grok|grok"
  "zcode|Z Code|.zcode/skills|.zcode/skills|.zcode|zcode"
  "opencode|OpenCode|.config/opencode/skills|.opencode/skills|.config/opencode|opencode"
)

# ---------- output ----------
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; O=$'\033[38;5;208m'; G=$'\033[32m'; R=$'\033[31m'; N=$'\033[0m'; else B= D= O= G= R= N=; fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$O" "$N" "$*"; }
die()  { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
usage() { sed -n '2,15p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0; }

# ---------- args ----------
SEL=""; ALL=0; YES=0; SCOPE=""; PROJECT=""; MODE=""; ACTION=install; LIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --agents) SEL="${2:-}"; shift ;;
    --agents=*) SEL="${1#*=}" ;;
    --all) ALL=1 ;;
    -y|--yes) YES=1 ;;
    --global) SCOPE=global ;;
    --project) SCOPE=project; if [ -n "${2:-}" ] && [ "${2#-}" = "$2" ]; then PROJECT="$2"; shift; else PROJECT="$PWD"; fi ;;
    --project=*) SCOPE=project; PROJECT="${1#*=}" ;;
    --link) MODE=link ;;
    --copy) MODE=copy ;;
    --uninstall) ACTION=uninstall ;;
    --list) LIST=1 ;;
    -h|--help) usage ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

# interactive input works even when piped through `curl | bash`
TTY=""
if [ -t 0 ]; then TTY=/dev/stdin; elif [ -r /dev/tty ] && (: < /dev/tty) 2>/dev/null; then TTY=/dev/tty; fi
ask() { local __v; if [ -n "$TTY" ]; then IFS= read -r __v < "$TTY" || __v=""; else __v=""; fi; printf '%s' "$__v"; }

field() { printf '%s' "$1" | cut -d'|' -f"$2"; }
detected() {
  local entry="$1" p c
  IFS=':' read -r -a ps <<< "$(field "$entry" 5)"
  for p in "${ps[@]}"; do [ -e "$HOME/$p" ] && return 0; done
  IFS=':' read -r -a cs <<< "$(field "$entry" 6)"
  for c in "${cs[@]}"; do command -v "$c" >/dev/null 2>&1 && return 0; done
  return 1
}
target_for() { # entry -> install dir
  if [ "$SCOPE" = project ]; then printf '%s/%s/%s' "$PROJECT" "$(field "$1" 4)" "$SKILL"
  else printf '%s/%s/%s' "$HOME" "$(field "$1" 3)" "$SKILL"; fi
}

if [ "$LIST" = 1 ]; then
  printf '%-12s %-16s %-34s %-22s %s\n' ID AGENT GLOBAL PROJECT DETECTED
  for e in "${AGENTS[@]}"; do
    d=no; detected "$e" && d=yes
    printf '%-12s %-16s %-34s %-22s %s\n' "$(field "$e" 1)" "$(field "$e" 2)" "~/$(field "$e" 3)" "$(field "$e" 4)" "$d"
  done
  exit 0
fi

say ""
say "${B}Variant Studio ${O}2.0${N}${B} installer${N}"
say "${D}Installs the '$SKILL' skill into your coding agents.${N}"
say ""

# ---------- choose agents ----------
CHOSEN=()
if [ "$ALL" = 1 ]; then
  for i in "${!AGENTS[@]}"; do CHOSEN+=("$i"); done
elif [ -n "$SEL" ]; then
  IFS=',' read -r -a want <<< "$SEL"
  for w in "${want[@]}"; do
    w="$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"; found=""
    for i in "${!AGENTS[@]}"; do [ "$(field "${AGENTS[$i]}" 1)" = "$w" ] && found=$i; done
    [ -n "$found" ] || die "Unknown agent '$w'. Valid ids: $(for e in "${AGENTS[@]}"; do printf '%s ' "$(field "$e" 1)"; done)"
    CHOSEN+=("$found")
  done
else
  [ -n "$TTY" ] || die "No terminal for the interactive menu. Use --agents claude,codex or --all."
  PICK=()
  for i in "${!AGENTS[@]}"; do if detected "${AGENTS[$i]}"; then PICK[$i]=1; else PICK[$i]=0; fi; done
  while :; do
    say "${B}Select the agents${N} ${D}(detected ones are pre-selected)${N}"
    for i in "${!AGENTS[@]}"; do
      e="${AGENTS[$i]}"; mark=" "; [ "${PICK[$i]}" = 1 ] && mark="${O}x${N}"
      det=""; detected "$e" && det="${G}detected${N}"
      printf '  [%b] %2d  %-16s %s\n' "$mark" $((i + 1)) "$(field "$e" 2)" "$det"
    done
    printf '%s' "Numbers to toggle (e.g. 1 3), ${B}a${N}=all, ${B}n${N}=none, ${B}Enter${N}=continue, ${B}q${N}=quit: "
    line="$(ask)"; say ""
    case "$line" in
      "") break ;;
      q|Q) exit 0 ;;
      a|A) for i in "${!AGENTS[@]}"; do PICK[$i]=1; done ;;
      n|N) for i in "${!AGENTS[@]}"; do PICK[$i]=0; done ;;
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

# ---------- scope + mode ----------
if [ -z "$SCOPE" ]; then
  if [ "$YES" = 1 ] || [ -z "$TTY" ]; then SCOPE=global
  else
    printf '%s' "Install ${B}g${N}lobally (all projects) or into a ${B}p${N}roject? [G/p]: "; a="$(ask)"
    case "$a" in p|P) SCOPE=project ;; *) SCOPE=global ;; esac
  fi
fi
if [ "$SCOPE" = project ] && [ -z "$PROJECT" ]; then
  printf '%s' "Project folder [${PWD}]: "; PROJECT="$(ask)"; PROJECT="${PROJECT:-$PWD}"
fi
if [ "$SCOPE" = project ]; then
  PROJECT="${PROJECT/#\~/$HOME}"
  [ -d "$PROJECT" ] || die "Project folder not found: $PROJECT"
  PROJECT="$(cd "$PROJECT" && pwd)"
fi

# ---------- source ----------
HERE=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT
if [ "$ACTION" = install ]; then
  if [ -n "$HERE" ] && [ -f "$HERE/SKILL.md" ] && [ -f "$HERE/scripts/studio.mjs" ]; then SRC="$HERE"
  else
    say "${D}Downloading the latest Variant Studio from GitHub…${N}"
    TMP="$(mktemp -d)"
    if command -v curl >/dev/null 2>&1; then curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP"
    elif command -v wget >/dev/null 2>&1; then wget -qO- "$REPO_TARBALL" | tar -xz -C "$TMP"
    else die "curl or wget is required to download the skill."; fi
    SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n1)"
    [ -f "$SRC/SKILL.md" ] || die "Download did not contain SKILL.md"
    if [ "$MODE" = link ]; then warn "--link needs a local clone; copying instead."; MODE=copy; fi
  fi
  if [ -z "$MODE" ]; then
    if [ "$YES" = 1 ] || [ -z "$TTY" ] || [ "$SRC" != "$HERE" ]; then MODE=copy
    else
      printf '%s' "${B}C${N}opy the files, or ${B}l${N}ink to this folder (stays updated with git pull)? [C/l]: "; a="$(ask)"
      case "$a" in l|L) MODE=link ;; *) MODE=copy ;; esac
    fi
  fi
fi

# ---------- helpers ----------
is_ours() { # path is safe to replace/remove
  [ -L "$1" ] && return 0
  [ -f "$1/SKILL.md" ] && grep -q "^name: *$SKILL *$" "$1/SKILL.md"
}
copy_skill() { # src dst
  mkdir -p "$2"
  (cd "$1" && tar -cf - --exclude=.git --exclude=.variant-studio --exclude=node_modules \
      --exclude=install.sh --exclude=install.ps1 --exclude=install.cmd .) | (cd "$2" && tar -xf -)
}

# ---------- confirm ----------
say ""
if [ "$ACTION" = install ]; then VERB=Install; else VERB=Uninstall; fi
say "${B}${VERB}${N} ${D}(${SCOPE}${MODE:+, $MODE})${N}:"
for i in "${CHOSEN[@]}"; do printf '  %-16s %s\n' "$(field "${AGENTS[$i]}" 2)" "$(target_for "${AGENTS[$i]}")"; done
if [ "$YES" != 1 ] && [ -n "$TTY" ]; then
  printf '%s' "Proceed? [Y/n]: "; a="$(ask)"
  case "$a" in n|N) say "Cancelled."; exit 0 ;; esac
fi
say ""

# ---------- do it ----------
DONE=0
for i in "${CHOSEN[@]}"; do
  e="${AGENTS[$i]}"; name="$(field "$e" 2)"; dst="$(target_for "$e")"
  if [ "$ACTION" = uninstall ]; then
    if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then warn "$name: not installed"; continue; fi
    is_ours "$dst" || { warn "$name: $dst is not Variant Studio, left untouched"; continue; }
    rm -rf "$dst"; ok "$name: removed $dst"; DONE=$((DONE + 1)); continue
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    if [ "$SRC" = "$dst" ] || { [ -d "$dst" ] && [ "$(cd "$dst" && pwd -P)" = "$(cd "$SRC" && pwd -P)" ]; }; then ok "$name: already this folder ($dst)"; DONE=$((DONE + 1)); continue; fi
    is_ours "$dst" || { warn "$name: $dst exists and is not Variant Studio — skipped"; continue; }
    rm -rf "$dst"
  fi
  mkdir -p "$(dirname "$dst")"
  if [ "$MODE" = link ]; then ln -s "$SRC" "$dst"; else copy_skill "$SRC" "$dst"; fi
  ok "$name: $dst"; DONE=$((DONE + 1))
done

say ""
if [ "$ACTION" = install ]; then
  if command -v node >/dev/null 2>&1; then
    v="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$v" -lt 18 ]; then warn "Node.js $(node -v) found; Variant Studio needs Node 18 or newer."; else ok "Node.js $(node -v)"; fi
  else
    warn "Node.js not found. Install Node 18+ (https://nodejs.org) — the studio server runs on Node."
  fi
  say ""
  say "${B}Done.${N} Installed for $DONE agent(s). Restart the agent, then ask for design variants"
  say "(e.g. \"show me 3 versions of the pricing card\") or invoke the skill by name: ${O}$SKILL${N}."
else
  say "${B}Done.${N} Removed from $DONE agent(s)."
fi
