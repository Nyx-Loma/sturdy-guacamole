#!/usr/bin/env bash
set -euo pipefail

toxiproxy-cli toxic add redis -t latency --toxicty 1 --attributes latency=2000 --attributes jitter=500 --name redis_latency || true
sleep 30
toxiproxy-cli toxic remove redis -n redis_latency || true


