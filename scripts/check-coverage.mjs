/* eslint-disable no-undef */
import fs from 'node:fs';
import path from 'node:path';

const coverageFile = path.resolve('coverage/coverage-final.json');

if (!fs.existsSync(coverageFile)) {
  console.error('Coverage report not found at coverage/coverage-final.json. Run pnpm coverage first.');
  process.exit(1);
}

const coverageMap = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
const workspaceRoot = process.cwd().replaceAll('\\', '/') + '/';

const groups = [
  {
    name: 'services/auth',
    include: [/^services\/auth\/src\//],
    exclude: [/^services\/auth\/src\/tests\//],
    minimum: { lines: 0.9, statements: 0.9, branches: 0.85, functions: 0.9 }
  },
  {
    name: 'packages/transport',
    include: [/^packages\/transport\/src\//],
    exclude: [/^packages\/transport\/src\/__tests__\//, /^packages\/transport\/src\/tests\//],
    minimum: { lines: 0.92, statements: 0.92, branches: 0.85, functions: 0.92 }
  },
  {
    name: 'packages/crypto',
    include: [/^packages\/crypto\/src\//],
    exclude: [/^packages\/crypto\/src\/__tests__\//, /^packages\/crypto\/src\/tests\//],
    minimum: { lines: 0.9, statements: 0.9, branches: 0.85, functions: 0.9 }
  },
  {
    name: 'services/directory',
    include: [/^services\/directory\/src\//],
    exclude: [/^services\/directory\/src\/tests\//],
    minimum: { lines: 0.9, statements: 0.9, branches: 0.85, functions: 0.9 }
  },
  {
    name: 'global',
    include: [/^services\/[^/]+\/src\//, /^packages\/[^/]+\/src\//, /^apps\/[^/]+\/src\//],
    exclude: [/\/src\/tests\//, /^scripts\//],
    minimum: { lines: 0.84, statements: 0.86, branches: 0.86, functions: 0.86 }
  }
];

const zeroTotals = () => ({
  lines: { total: 0, covered: 0 },
  statements: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 }
});

const addCoverage = (totals, fileCoverage) => {
  const stats = {
    statements: Object.values(fileCoverage.s || {}),
    functions: Object.values(fileCoverage.f || {}),
    branches: Object.values(fileCoverage.b || {}),
    lines: Object.values(fileCoverage.l || {})
  };

  totals.statements.total += stats.statements.length;
  totals.statements.covered += stats.statements.filter(Boolean).length;

  totals.functions.total += stats.functions.length;
  totals.functions.covered += stats.functions.filter(Boolean).length;

  const branchTotals = stats.branches.reduce(
    (acc, hits) => {
      acc.total += hits.length;
      acc.covered += hits.filter(Boolean).length;
      return acc;
    },
    { total: 0, covered: 0 }
  );
  totals.branches.total += branchTotals.total;
  totals.branches.covered += branchTotals.covered;

  totals.lines.total += stats.lines.length;
  totals.lines.covered += stats.lines.filter(Boolean).length;
};

const matchesGroup = (filePath, group) => {
  const normalized = filePath.replaceAll('\\', '/');
  const relative = normalized.startsWith(workspaceRoot) ? normalized.slice(workspaceRoot.length) : normalized;
  const included = group.include.some((regex) => regex.test(relative));
  const excluded = group.exclude?.some((regex) => regex.test(relative)) ?? false;
  return included && !excluded;
};

const toRatio = (covered, total) => {
  if (total === 0) return 1;
  return covered / total;
};

const results = groups.map((group) => {
  const totals = zeroTotals();
  let matched = 0;

  for (const [filePath, fileCoverage] of Object.entries(coverageMap)) {
    if (matchesGroup(filePath, group)) {
      addCoverage(totals, fileCoverage);
      matched += 1;
    }
  }

  if (matched === 0) {
    return { group, failure: `${group.name}: no files matched coverage filters` };
  }

  const ratios = {
    lines: toRatio(totals.lines.covered, totals.lines.total),
    statements: toRatio(totals.statements.covered, totals.statements.total),
    branches: toRatio(totals.branches.covered, totals.branches.total),
    functions: toRatio(totals.functions.covered, totals.functions.total)
  };

  const failures = Object.entries(group.minimum).flatMap(([metric, min]) => {
    const actual = ratios[metric];
    if (actual < min) {
      return `${group.name}: ${metric} coverage ${Math.round(actual * 100)}% < ${Math.round(min * 100)}%`;
    }
    return [];
  });

  return { group, failures };
});

const failures = results.flatMap((result) => {
  if (result.failure) return [result.failure];
  return result.failures;
});

if (failures.length > 0) {
  console.error('Coverage thresholds not met:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Coverage thresholds satisfied');

