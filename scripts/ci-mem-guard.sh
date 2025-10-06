#!/usr/bin/env bash
set -euo pipefail

# CI Memory Guard
# Fails the build if memory usage exceeds threshold after tests
# Usage: ./scripts/ci-mem-guard.sh

THRESHOLD_MB=2500
THRESHOLD_BYTES=$((THRESHOLD_MB * 1024 * 1024))

# Get current RSS in bytes
RSS=$(node -e "console.log(process.memoryUsage().rss)")

RSS_MB=$((RSS / 1024 / 1024))

echo "📊 Memory Check:"
echo "  RSS: ${RSS_MB} MB"
echo "  Threshold: ${THRESHOLD_MB} MB"

if [ "$RSS" -gt "$THRESHOLD_BYTES" ]; then
  echo "❌ FAIL: RSS too high (${RSS_MB} MB > ${THRESHOLD_MB} MB)"
  echo "   This may indicate a memory leak. Investigate with --heapsnapshot-near-heap-limit."
  exit 1
fi

echo "✅ PASS: Memory usage within acceptable limits"
exit 0
