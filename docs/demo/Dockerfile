# The demo recorder: the VHS image (Chrome, ttyd, ffmpeg) plus Node 22 and an `mm3` shim, so the
# tape can run the built CLI (bin/mm3.mjs) from a read-only checkout mounted at /repo.
# Build: docker build -t mm3-vhs:local docs/demo   (see docs/demo/README.md to render)
FROM ghcr.io/charmbracelet/vhs:v0.12.1
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
# The shim runs the mounted CLI. With MM3_DEMO_CAPTURE=<file> it also saves stdout there, so the
# README can freeze the exact response the recording shows.
RUN printf '%s\n' '#!/bin/sh' \
  'if [ -n "$MM3_DEMO_CAPTURE" ]; then node /repo/bin/mm3.mjs "$@" | tee "$MM3_DEMO_CAPTURE"; else exec node /repo/bin/mm3.mjs "$@"; fi' \
  > /usr/local/bin/mm3 && chmod +x /usr/local/bin/mm3
