#!/usr/bin/env node
/* eslint-env node */
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import coveragePkg from 'istanbul-lib-coverage';
import reportPkg from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(__dirname, '..');
const coverageDir = join(serviceRoot, 'coverage', 'messaging-unit');

const suites = [
  { label: 'unit:routes', path: 'src/tests/unit/routes' },
  { label: 'unit:app', path: 'src/tests/unit/app' },
  { label: 'unit:stream', path: 'src/tests/unit/stream' },
  { label: 'unit:usecases', path: 'src/tests/unit/usecases' },
  { label: 'unit:domain', path: 'src/tests/unit/domain' },
  { label: 'unit:ports', path: 'src/tests/unit/ports' },
  { label: 'unit:infra', path: 'src/tests/unit/infra' },
  { label: 'unit:ws', path: 'src/tests/unit/ws' },
];

const { createCoverageMap } = coveragePkg;
const { createContext } = reportPkg;

const coverageMap = createCoverageMap({});

const runSuite = (suite) => {
  console.log(`\n=== Running ${suite.label} ===`);
  const result = spawnSync('pnpm', ['vitest', 'run', suite.path], {
    stdio: 'inherit',
    cwd: serviceRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192',
      VITEST_COVERAGE: '1',
    },
  });

  if (result.status !== 0) {
    throw new Error(`Suite failed: ${suite.label}`);
  }

  const lcovPath = join(coverageDir, 'lcov.info');
  if (!fs.existsSync(lcovPath)) {
    throw new Error(`Coverage file missing after ${suite.label} run`);
  }

  const summaryDir = join(coverageDir, suite.label.replace(/:/g, '_'));
  fs.rmSync(summaryDir, { recursive: true, force: true });
  fs.renameSync(coverageDir, summaryDir);
  fs.mkdirSync(coverageDir, { recursive: true });

  const jsonPath = join(summaryDir, 'coverage-final.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Coverage JSON missing in ${summaryDir}`);
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  coverageMap.merge(json);
};

const main = async () => {
  fs.rmSync(coverageDir, { recursive: true, force: true });
  fs.mkdirSync(coverageDir, { recursive: true });

  for (const suite of suites) {
    runSuite(suite);
  }

  const context = createContext({
    dir: coverageDir,
    coverageMap,
    defaultSummarizer: 'pkg',
  });

  const reporters = [reports.create('text'), reports.create('text-summary'), reports.create('lcov'), reports.create('json')];

  for (const reporter of reporters) {
    reporter.execute(context);
  }

  console.log('\n=== Combined coverage written to', coverageDir, '===');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

