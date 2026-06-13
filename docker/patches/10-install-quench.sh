#!/usr/bin/env bash
##
## Container patch — runs after Foundry is installed but before the server
## starts (felddy CONTAINER_PATCHES).  Downloads Quench into the data volume
## so it is available on every fresh CI run.
##
set -euo pipefail

QUENCH_VERSION="${QUENCH_VERSION:-v0.10.0}"
QUENCH_URL="https://github.com/Ethaks/FVTT-Quench/releases/download/${QUENCH_VERSION}/module.zip"
MODDIR="/data/modules/quench"

if [[ -f "${MODDIR}/module.json" ]]; then
  echo "[traveler-patch] Quench already present at ${MODDIR}"
  exit 0
fi

echo "[traveler-patch] Installing Quench ${QUENCH_VERSION} → ${MODDIR}"
mkdir -p "${MODDIR}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -fsSL "${QUENCH_URL}" -o "${tmpdir}/module.zip"
unzip -q "${tmpdir}/module.zip" -d "${MODDIR}"

if [[ ! -f "${MODDIR}/module.json" ]]; then
  echo "[traveler-patch] ERROR: module.json not found after unzip" >&2
  exit 1
fi

echo "[traveler-patch] Quench installed successfully."
