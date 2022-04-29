#!/usr/bin/env bash
set -euo pipefail

publish() {
  VERSION=${1:?"Version is required"}
  deno run -A ./build_npm.ts "${VERSION}"
}

"$@"