#!/bin/sh
set -eu

runtime="${npm_node_execpath:-}"
if [ -z "$runtime" ]; then
  runtime="$(command -v node)"
fi

version="$($runtime -p "process.versions.node")"
case "$version" in
  22.23.1) ;;
  *)
    echo "Unsupported environment" >&2
    echo "Expected Node: 22.23.1" >&2
    echo "Got: Node $version ($runtime)" >&2
    echo "Run 'nvm install 22 && nvm use 22 && corepack enable', then retry." >&2
    exit 1
    ;;
esac

exec "$runtime" "$@"
