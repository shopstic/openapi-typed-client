#!/usr/bin/env bash
set -euo pipefail

build_npm() {
  VERSION=${1:?"Version is required"}
  deno run -A --check ./build-npm.ts "${VERSION}"
}

publish_npm() {
  npm publish ./dist
}

"$@"