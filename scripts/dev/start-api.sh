#!/usr/bin/env bash
set -euo pipefail

echo "Starting LiNa API bootstrap..."
npx tsx apps/api/src/index.ts
