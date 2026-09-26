#!/bin/sh
# Run the default test tiers in a clean container per Node version, sequentially, capped for a shared box.
#   SIDEWISE_NODE_VERSIONS="22 24" npm run test:container
set -eu
cd "$(dirname "$0")/.."
VERSIONS="${SIDEWISE_NODE_VERSIONS:-22}"
CPUS="${SIDEWISE_TEST_CPUS:-2}"
MEM="${SIDEWISE_TEST_MEMORY:-2g}"

for v in $VERSIONS; do
  tag="sidewise-test:node$v"
  echo "== node $v =="
  docker build -q -f docker/Dockerfile.test --build-arg NODE_VERSION="$v" -t "$tag" . > /dev/null
  docker run --rm --network none --cpus "$CPUS" --memory "$MEM" "$tag"
done
