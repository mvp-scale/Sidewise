#!/bin/sh
# Run the default test tiers in a clean container per Node version, sequentially, capped for a shared box.
#   MM3_NODE_VERSIONS="22 24" npm run test:container
set -eu
cd "$(dirname "$0")/../.."
VERSIONS="${MM3_NODE_VERSIONS:-22}"
CPUS="${MM3_TEST_CPUS:-2}"
MEM="${MM3_TEST_MEMORY:-2g}"

for v in $VERSIONS; do
  tag="mm3-test:node$v"
  echo "== node $v =="
  docker build -q -f test/docker/Dockerfile.test --build-arg NODE_VERSION="$v" -t "$tag" . > /dev/null
  docker run --rm --network none --cpus "$CPUS" --memory "$MEM" "$tag"
done
