#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f generated/kernels.json ]; then npm run build:kernels; fi
exec node scripts/serve.mjs
