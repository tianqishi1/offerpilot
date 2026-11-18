#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node.js 20+: https://nodejs.org/"
  exit 1
fi
node scripts/start.mjs
