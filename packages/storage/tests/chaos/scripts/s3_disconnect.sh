#!/usr/bin/env bash
set -euo pipefail

toxiproxy-cli toxic add s3 -t bandwidth --toxicity 1 --attributes rate=1 --name s3_disconnect || true
sleep 30
toxiproxy-cli toxic remove s3 -n s3_disconnect || true


