# Transport Ops Notes

- Dependencies pinned in `package.json` for reproducible builds.
- Environment variables documented in `env.example` including optional tunables: `WS_MAX_QUEUE_LENGTH`, `WS_MAX_REPLAY_BATCH_SIZE`, `METRICS_PREFIX`.
- To generate an SBOM: `pnpm dlx cyclonedx-npm --output-format json --output-file sbom.json`.
- Nightly status: ![Nightly Heavy Tests](https://github.com/OWNER/REPO/actions/workflows/nightly.yml/badge.svg)

