#!/usr/bin/env bash
##
## Container patch — installs the official dnd5e system before Foundry starts.
## Avoids fragile Setup UI automation in Playwright bootstrap.
##
set -euo pipefail

finish() {
  local code="${1:-0}"
  [[ "${BASH_SOURCE[0]}" == "$0" ]] && exit "${code}" || return "${code}"
}

SYSDIR="/data/Data/systems/dnd5e"
MANIFEST_URL="https://github.com/foundryvtt/dnd5e/releases/latest/download/system.json"

if [[ -f "${SYSDIR}/system.json" ]]; then
  echo "[traveler-patch] dnd5e already present at ${SYSDIR}"
  finish 0
fi

echo "[traveler-patch] Installing dnd5e → ${SYSDIR}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -fsSL "${MANIFEST_URL}" -o "${tmpdir}/system.json"
DOWNLOAD_URL="$(
  sed -n 's/.*"download"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${tmpdir}/system.json" | head -1
)"

if [[ -z "${DOWNLOAD_URL}" ]]; then
  echo "[traveler-patch] ERROR: could not parse download URL from manifest" >&2
  finish 1
fi

echo "[traveler-patch] Downloading dnd5e from ${DOWNLOAD_URL}"
curl -fsSL "${DOWNLOAD_URL}" -o "${tmpdir}/dnd5e.zip"
unzip -q "${tmpdir}/dnd5e.zip" -d "${tmpdir}/extract"

src="${tmpdir}/extract"
if [[ ! -f "${src}/system.json" ]]; then
  found="$(find "${src}" -name system.json -print -quit || true)"
  if [[ -n "${found}" ]]; then
    src="$(dirname "${found}")"
  fi
fi

if [[ ! -f "${src}/system.json" ]]; then
  echo "[traveler-patch] ERROR: system.json not found after unzip" >&2
  find "${src}" -maxdepth 3 -type f | head -20 >&2 || true
  finish 1
fi

mkdir -p "${SYSDIR}"
cp -a "${src}/." "${SYSDIR}/"

if [[ ! -f "${SYSDIR}/system.json" ]]; then
  echo "[traveler-patch] ERROR: install finished but ${SYSDIR}/system.json is missing" >&2
  finish 1
fi

echo "[traveler-patch] dnd5e installed successfully."
