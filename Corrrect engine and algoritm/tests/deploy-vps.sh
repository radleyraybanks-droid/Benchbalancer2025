#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-72.60.110.72}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/benchbalancer}"
LOCAL_DIR_DEFAULT="$(pwd)"
LOCAL_DIR="${LOCAL_DIR:-$LOCAL_DIR_DEFAULT}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
REMOTE_OWNER="${REMOTE_OWNER:-}"
DRY_RUN=0

usage() {
cat <<EOF
Usage: ${0##*/} [options]

Options:
  -H host        Remote host or IP (default: $REMOTE_HOST)
  -u user        Remote SSH user (default: $REMOTE_USER)
  -P port        SSH port (default: $REMOTE_PORT)
  -r path        Remote deploy directory (default: $REMOTE_PATH)
  -l dir         Local project directory to deploy (default: current dir)
  -k count       Backups to keep (default: $KEEP_BACKUPS, 0 disables pruning)
  -O owner[:grp] Remote owner:group for deployed files (default: disabled)
  -B             Skip creating a backup snapshot before sync
  -n             Dry run (rsync preview; implies -B and no nginx reload)
  -N             Skip nginx reload on the VPS
  -h             Show this help

Environment variables with the same names override these defaults.
EOF
}

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[deploy] Missing required command: $1" >&2
    exit 1
  }
}

version_to_key() {
  local version="$1"
  local major=0 minor=0 patch=0
  IFS=. read -r major minor patch <<< "$version"
  major=${major//[^0-9]/}
  minor=${minor//[^0-9]/}
  patch=${patch//[^0-9]/}
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}
  printf '%03d%03d%03d' "$major" "$minor" "$patch"
}

rsync_supports_info_progress2() {
  local version_key
  version_key=$(version_to_key "$1") || return 1
  local threshold_key
  threshold_key=$(version_to_key "3.1.0") || return 1
  [[ "$version_key" -ge "$threshold_key" ]]
}

while getopts ":H:u:P:r:l:k:O:BnNh" opt; do
  case "$opt" in
    H) REMOTE_HOST="$OPTARG" ;;
    u) REMOTE_USER="$OPTARG" ;;
    P) REMOTE_PORT="$OPTARG" ;;
    r) REMOTE_PATH="$OPTARG" ;;
    l) LOCAL_DIR="$OPTARG" ;;
    k) KEEP_BACKUPS="$OPTARG" ;;
    O) REMOTE_OWNER="$OPTARG" ;;
    B) SKIP_BACKUP=1 ;;
    n) DRY_RUN=1 ;;
    N) RELOAD_NGINX=0 ;;
    h) usage; exit 0 ;;
    :)
      echo "[deploy] Option -$OPTARG requires a value." >&2
      exit 1
      ;;
    \?)
      echo "[deploy] Unknown option: -$OPTARG." >&2
      exit 1
      ;;
  esac
done

shift $((OPTIND - 1))

for numeric in KEEP_BACKUPS RELOAD_NGINX SKIP_BACKUP REMOTE_PORT; do
  value="${!numeric}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "[deploy] $numeric must be numeric; got '$value'." >&2
    exit 1
  fi
done

if (( RELOAD_NGINX != 0 )); then RELOAD_NGINX=1; fi
if (( SKIP_BACKUP != 0 )); then SKIP_BACKUP=1; fi

if (( DRY_RUN )); then
  SKIP_BACKUP=1
  RELOAD_NGINX=0
fi

if [[ ! -d "$LOCAL_DIR" ]]; then
  echo "[deploy] Local directory '$LOCAL_DIR' not found." >&2
  exit 1
fi

LOCAL_DIR="$(cd "$LOCAL_DIR" && pwd)"

require ssh
require rsync

RSYNC_PROGRESS_FLAG=(--progress)
RSYNC_VERSION_RAW=$(rsync --version 2>/dev/null | head -n1 | awk '{print $3}')
if [[ -n "$RSYNC_VERSION_RAW" ]] && rsync_supports_info_progress2 "$RSYNC_VERSION_RAW"; then
  RSYNC_PROGRESS_FLAG=(--info=progress2)
fi

TIMESTAMP="$(date -u '+%Y%m%d%H%M%S')"
BACKUP_NAME="backup-${TIMESTAMP}.tar.gz"

EXCLUDES=(
  "--exclude=.git/"
  "--exclude=.gitignore"
  "--exclude=.github/"
  "--exclude=.vscode/"
  "--exclude=.DS_Store"
  "--exclude=backups/"
  "--exclude=deploy.sh"
  "--exclude=deploy-vps.sh"
  "--exclude=tests/"
  "--exclude=test.js"
  "--exclude=testRegex.js"
  "--exclude=*.tar.gz"
  "--exclude=*.log"
)

RSYNC_FLAGS=(-az --delete "${RSYNC_PROGRESS_FLAG[@]}")
(( DRY_RUN )) && RSYNC_FLAGS+=("--dry-run")

SSH_BASE=(ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}")

trap 'echo "[deploy] ❌  Deployment aborted." >&2' ERR
trap 'echo "[deploy] ⚠️  Deployment interrupted." >&2' INT

echo "[deploy] Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
echo "[deploy] Source: $LOCAL_DIR"
(( DRY_RUN )) && echo "[deploy] Dry run mode enabled; remote state will not change."

echo "[deploy] Verifying SSH connectivity..."
if ! "${SSH_BASE[@]}" true; then
  echo "[deploy] Unable to reach ${REMOTE_HOST} via SSH." >&2
  exit 1
fi

if (( SKIP_BACKUP == 0 )); then
  echo "[deploy] Creating remote backup snapshot..."
  "${SSH_BASE[@]}" bash -s -- "$REMOTE_PATH" "$BACKUP_NAME" "$KEEP_BACKUPS" <<'REMOTE_BACKUP'
set -euo pipefail
REMOTE_PATH="$1"
BACKUP_NAME="$2"
KEEP_BACKUPS="$3"

SUDO_CMD=()
if command -v sudo >/dev/null 2>&1; then
  SUDO_CMD=(sudo)
fi

"${SUDO_CMD[@]}" mkdir -p "$REMOTE_PATH" "$REMOTE_PATH/backups"

if "${SUDO_CMD[@]}" find "$REMOTE_PATH" -mindepth 1 -maxdepth 1 ! -name backups -print -quit | grep -q .; then
  "${SUDO_CMD[@]}" tar -czf "$REMOTE_PATH/backups/$BACKUP_NAME" --exclude="backups" -C "$REMOTE_PATH" .
  echo "[remote] Created backup snapshot: $REMOTE_PATH/backups/$BACKUP_NAME"
else
  echo "[remote] Nothing to back up under $REMOTE_PATH."
fi

if (( KEEP_BACKUPS > 0 )); then
  CLEAN=$((KEEP_BACKUPS + 1))
  if "${SUDO_CMD[@]}" ls "$REMOTE_PATH"/backups/*.tar.gz >/dev/null 2>&1; then
    "${SUDO_CMD[@]}" ls -1t "$REMOTE_PATH"/backups/*.tar.gz | tail -n +"$CLEAN" | while read -r FILE; do
      if [[ -n "$FILE" ]]; then
        "${SUDO_CMD[@]}" rm -f "$FILE"
      fi
    done
    echo "[remote] Pruned backups; retaining latest $KEEP_BACKUPS snapshot(s)."
  fi
fi
REMOTE_BACKUP
fi

echo "[deploy] Syncing files to VPS..."
RSYNC_CMD=(
  rsync "${RSYNC_FLAGS[@]}"
  "${EXCLUDES[@]}"
  -e "ssh -p $REMOTE_PORT -o StrictHostKeyChecking=no"
  "$LOCAL_DIR/"
  "${REMOTE_USER}@${REMOTE_HOST}:$REMOTE_PATH/"
)
"${RSYNC_CMD[@]}"

if (( DRY_RUN == 0 )); then
  "${SSH_BASE[@]}" bash -s -- "$REMOTE_PATH" "$REMOTE_OWNER" "$RELOAD_NGINX" <<'REMOTE_POST'
set -euo pipefail
REMOTE_PATH="$1"
REMOTE_OWNER="$2"
RELOAD_NGINX="$3"

SUDO_CMD=()
if command -v sudo >/dev/null 2>&1; then
  SUDO_CMD=(sudo)
fi

if [[ -n "$REMOTE_OWNER" ]]; then
  if "${SUDO_CMD[@]}" chown -R "$REMOTE_OWNER" "$REMOTE_PATH"; then
    echo "[remote] Ownership set to $REMOTE_OWNER."
  else
    echo "[remote] chown failed for $REMOTE_OWNER; verify user/group exists." >&2
  fi
fi

if [[ "$RELOAD_NGINX" == "1" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    if "${SUDO_CMD[@]}" systemctl reload nginx >/dev/null 2>&1; then
      echo "[remote] nginx reloaded via systemctl."
    elif "${SUDO_CMD[@]}" systemctl restart nginx >/dev/null 2>&1; then
      echo "[remote] nginx restarted via systemctl."
    else
      echo "[remote] nginx reload failed via systemctl." >&2
    fi
  elif command -v service >/dev/null 2>&1; then
    if "${SUDO_CMD[@]}" service nginx reload >/dev/null 2>&1; then
      echo "[remote] nginx reloaded via service."
    elif "${SUDO_CMD[@]}" service nginx restart >/dev/null 2>&1; then
      echo "[remote] nginx restarted via service."
    else
      echo "[remote] nginx reload failed via service." >&2
    fi
  else
    echo "[remote] nginx reload skipped: init system not detected."
  fi
else
  echo "[remote] nginx reload skipped (disabled)."
fi
REMOTE_POST
fi

if (( DRY_RUN )); then
  echo "[deploy] ✅ Dry run complete; no changes applied."
else
  echo "[deploy] ✅ Deployment finished at $(date -u '+%Y-%m-%d %H:%M:%S UTC')."
fi
