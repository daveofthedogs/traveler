#!/usr/bin/env bash
##
## Container patch — runs after Foundry is installed but before the server
## starts (felddy CONTAINER_PATCHES).  Downloads Quench into the data volume
## so it is available on every fresh CI run.
##
set -euo pipefail

finish() {
  local code="${1:-0}"
  [[ "${BASH_SOURCE[0]}" == "$0" ]] && exit "${code}" || return "${code}"
}

QUENCH_VERSION="${QUENCH_VERSION:-v0.10.0}"
QUENCH_URL="https://github.com/Ethaks/FVTT-Quench/releases/download/${QUENCH_VERSION}/module.zip"
MODDIR="/data/Data/modules/quench"

if [[ -f "${MODDIR}/module.json" ]]; then
  echo "[traveler-patch] Quench already present at ${MODDIR}"
  finish 0
fi

echo "[traveler-patch] Installing Quench ${QUENCH_VERSION} → ${MODDIR}"
mkdir -p "${MODDIR}"
tmpdir="$(mktemp -d)"
extract="${tmpdir}/extract"
trap 'rm -rf "${tmpdir}"' EXIT

curl -fsSL "${QUENCH_URL}" -o "${tmpdir}/module.zip"
unzip -q "${tmpdir}/module.zip" -d "${extract}"

# Quench v0.10.0 release zip nests files under dist/ (not at zip root).
src="${extract}"
if [[ -f "${extract}/dist/module.json" ]]; then
  src="${extract}/dist"
elif [[ ! -f "${extract}/module.json" ]]; then
  found="$(find "${extract}" -name module.json -print -quit || true)"
  if [[ -n "${found}" ]]; then
    src="$(dirname "${found}")"
  fi
fi

if [[ ! -f "${src}/module.json" ]]; then
  echo "[traveler-patch] ERROR: module.json not found after unzip (checked ${extract})" >&2
  find "${extract}" -maxdepth 3 -type f | head -20 >&2 || true
  finish 1
fi

cp -a "${src}/." "${MODDIR}/"

if [[ ! -f "${MODDIR}/module.json" ]]; then
  echo "[traveler-patch] ERROR: install finished but ${MODDIR}/module.json is missing" >&2
  finish 1
fi

echo "[traveler-patch] Quench installed successfully."
