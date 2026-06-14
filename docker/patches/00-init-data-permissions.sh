#!/usr/bin/env bash
##
## Container patch — symlink CI world into Foundry's data directory.
##
set -euo pipefail

echo "[traveler-patch] Linking CI world into Foundry data directory"

mkdir -p /data/Data/worlds
ln -sfn /mnt/traveler-ci-world /data/Data/worlds/traveler-ci

echo "[traveler-patch] World linked (traveler-ci → /mnt/traveler-ci-world) ✓"

mkdir -p /data/Data/modules
ln -sfn /mnt/traveler-module /data/Data/modules/traveler

echo "[traveler-patch] Module linked (traveler → /mnt/traveler-module) ✓"
