#!/usr/bin/env bash
set -euo pipefail

build_npm() {
  deno run -A --check ./build-npm.ts
}

publish_npm() {
  npm publish ./dist
}

"$@"