import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const tmp = await mkdtemp(path.join(tmpdir(), 'diagnostic-metadata-'));

try {
  const outfile = path.join(tmp, 'diagnosticMetadata.mjs');
  await build({
    entryPoints: [path.resolve('src/utils/diagnosticMetadata.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });

  const { parseDiagnosticMetadata } = await import(pathToFileURL(outfile).href);

  const valid = parseDiagnosticMetadata(JSON.stringify({
    generated_at: '2026-06-20T00:00:00Z',
    commit: 'abc1234',
    diagnostic_logd: ['diagnostic/build-abc1234.logd'],
    total_modules: 2,
    passed: 1,
    failed: 1,
    modules: [
      {
        name: 'frontend',
        status: 'PASS',
        command: 'npm run build',
        elapsed_seconds: 2.125,
        artifact: 'frontend/dist',
      },
      {
        name: 'backend',
        status: 'FAIL',
        duration_seconds: 1.25,
        artifact_missing: true,
      },
    ],
  }));

  assert.equal(valid.summary.commit, 'abc1234');
  assert.equal(valid.summary.totalModules, 2);
  assert.equal(valid.summary.missingDiagnosticArtifacts, false);
  assert.equal(valid.modules[0].command, 'npm run build');
  assert.equal(valid.modules[0].durationSeconds, 2.125);
  assert.deepEqual(valid.modules[0].artifactPaths, ['frontend/dist']);
  assert.equal(valid.modules[1].status, 'FAIL');
  assert.equal(valid.modules[1].missingArtifact, true);

  const missingArtifacts = parseDiagnosticMetadata(JSON.stringify({
    modules: [{ name: 'frontend', status: 'PASS' }],
  }));
  assert.equal(missingArtifacts.summary.missingDiagnosticArtifacts, true);

  assert.throws(
    () => parseDiagnosticMetadata('{not-json'),
    /Invalid diagnostic metadata JSON/,
  );
  assert.throws(
    () => parseDiagnosticMetadata(JSON.stringify({ modules: 'frontend' })),
    /modules array/,
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}
