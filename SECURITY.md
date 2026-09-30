# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue: use **[Report a vulnerability](https://github.com/mvp-scale/mm3/security/advisories/new)** on this repo's Security tab. We aim to reply within a few days and will credit you in the fix unless you'd rather we didn't.

## Supported versions

MM3 is in beta. Fixes land on `nightly` (published to npm as `@mvpscale/mm3@nightly`) and ship in the next release; older versions are not patched.

## How MM3 handles secrets

- Your TypeSafe API key is read from the environment, Claude Code's secure storage, the OS keychain, or a user-only (0600) file written by `mm3 init`. It is never written to the project, the config, the ledger or any output.
- MM3 sends only the goal, the questions and the code you name in `where:` to the TypeSafe endpoint you configure. Everything else, including the ledger, stays on your machine.
- Releases are published from GitHub Actions with npm trusted publishing and provenance; there is no npm token in this repository.
