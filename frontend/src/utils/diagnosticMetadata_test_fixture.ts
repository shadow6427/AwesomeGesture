import assert from 'assert';
import { compareDiagnosticMetadata, DiagnosticMetadataCompareView } from './diagnosticMetadata.js';

const baselineJSON = JSON.stringify({
  generated_at: "2026-06-20T10:00:00Z",
  commit: "baseline-hash",
  total_modules: 2,
  passed: 1,
  failed: 1,
  modules: [
    { name: "backend", status: "FAIL", elapsed_seconds: 1.5, artifact: ["target/debug/app"] },
    { name: "frontend", status: "PASS", elapsed_seconds: 2.0, artifact: ["dist"] },
    { name: "new-module", status: "PASS", artifact: ["out"] } // Baseline has new-module but candidate will have different artifacts if we want to test that. Wait, I'll just use the standard two.
  ]
});

const candidateJSON = JSON.stringify({
  generated_at: "2026-06-20T11:00:00Z",
  commit: "candidate-hash",
  total_modules: 3,
  passed: 1,
  failed: 2,
  modules: [
    { name: "backend", status: "PASS", elapsed_seconds: 1.2, artifact: ["target/debug/app"] },
    { name: "frontend", status: "FAIL", elapsed_seconds: 0.5, artifact: ["dist"] },
    { name: "new-module", status: "PASS", artifact: ["out-changed"] }
  ]
});

try {
  const result: DiagnosticMetadataCompareView = compareDiagnosticMetadata(baselineJSON, candidateJSON);

  assert.strictEqual(result.baselineSummary.commit, "baseline-hash");
  assert.strictEqual(result.candidateSummary.commit, "candidate-hash");
  
  assert.strictEqual(result.moduleDiffs.length, 3);

  const backendDiff = result.moduleDiffs.find(d => d.name === "backend");
  assert.ok(backendDiff);
  assert.strictEqual(backendDiff.statusChange, "RECOVERED");
  assert.strictEqual(backendDiff.artifactsChanged, false);

  const frontendDiff = result.moduleDiffs.find(d => d.name === "frontend");
  assert.ok(frontendDiff);
  assert.strictEqual(frontendDiff.statusChange, "FAILED");
  assert.strictEqual(frontendDiff.artifactsChanged, false);

  const newModuleDiff = result.moduleDiffs.find(d => d.name === "new-module");
  assert.ok(newModuleDiff);
  assert.strictEqual(newModuleDiff.statusChange, "UNCHANGED");
  assert.strictEqual(newModuleDiff.artifactsChanged, true);

  console.log("✓ Compare fixture tests passed: recovered module, newly failed module, and artifact changes detected successfully.");
  process.exit(0);
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}
