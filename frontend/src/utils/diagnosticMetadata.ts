export type DiagnosticModuleStatus = 'PASS' | 'FAIL' | 'WARN' | 'UNKNOWN';

export interface DiagnosticModuleRow {
  name: string;
  status: DiagnosticModuleStatus;
  command?: string;
  durationSeconds?: number;
  artifactPaths: string[];
  missingArtifact: boolean;
}

export interface DiagnosticMetadataSummary {
  generatedAt?: string;
  commit?: string;
  totalModules: number;
  passed: number;
  failed: number;
  diagnosticArtifacts: string[];
  missingDiagnosticArtifacts: boolean;
}

export interface DiagnosticMetadataView {
  summary: DiagnosticMetadataSummary;
  modules: DiagnosticModuleRow[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Diagnostic metadata must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeStatus(value: unknown): DiagnosticModuleStatus {
  const status = optionalString(value)?.toUpperCase();
  if (status === 'PASS' || status === 'FAIL' || status === 'WARN') {
    return status;
  }
  return 'UNKNOWN';
}

function boolFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function moduleArtifactPaths(module: Record<string, unknown>): string[] {
  return [
    ...stringArray(module.artifact),
    ...stringArray(module.artifacts),
    ...stringArray(module.artifact_path),
    ...stringArray(module.artifact_paths),
  ];
}

export function parseDiagnosticMetadata(jsonText: string): DiagnosticMetadataView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid diagnostic metadata JSON: ${message}`);
  }

  const root = asRecord(parsed);
  const rawModules = root.modules;
  if (!Array.isArray(rawModules)) {
    throw new Error('Diagnostic metadata must include a modules array.');
  }

  const modules = rawModules.map((rawModule, index): DiagnosticModuleRow => {
    const module = asRecord(rawModule);
    const artifactPaths = moduleArtifactPaths(module);
    const missingArtifact = boolFlag(module.artifact_missing) || boolFlag(module.missing_artifact);

    return {
      name: optionalString(module.name) ?? `module-${index + 1}`,
      status: normalizeStatus(module.status),
      command: optionalString(module.command) ?? optionalString(module.cmd),
      durationSeconds: optionalNumber(module.elapsed_seconds) ?? optionalNumber(module.duration_seconds),
      artifactPaths,
      missingArtifact,
    };
  });

  const diagnosticArtifacts = [
    ...stringArray(root.diagnostic_logd),
    ...stringArray(root.diagnostic_logd_path),
    ...stringArray(root.diagnostic_logd_paths),
  ];
  const failed = optionalNumber(root.failed) ?? modules.filter((module) => module.status === 'FAIL').length;
  const passed = optionalNumber(root.passed) ?? modules.filter((module) => module.status === 'PASS').length;

  return {
    summary: {
      generatedAt: optionalString(root.generated_at),
      commit: optionalString(root.commit),
      totalModules: optionalNumber(root.total_modules) ?? modules.length,
      passed,
      failed,
      diagnosticArtifacts,
      missingDiagnosticArtifacts:
        diagnosticArtifacts.length === 0 ||
        Boolean(optionalString(root.diagnostic_logd_error)) ||
        Boolean(optionalString(root.message_blocker)),
    },
    modules,
  };
}

export interface DiagnosticModuleDiff {
  name: string;
  isAdded: boolean;
  isRemoved: boolean;
  baseline?: DiagnosticModuleRow;
  candidate?: DiagnosticModuleRow;
  statusChange: 'RECOVERED' | 'FAILED' | 'UNCHANGED' | 'CHANGED';
  artifactsChanged: boolean;
}

export interface DiagnosticMetadataCompareView {
  baselineSummary: DiagnosticMetadataSummary;
  candidateSummary: DiagnosticMetadataSummary;
  moduleDiffs: DiagnosticModuleDiff[];
}

export function compareDiagnosticMetadata(baselineJSON: string, candidateJSON: string): DiagnosticMetadataCompareView {
  const baseline = parseDiagnosticMetadata(baselineJSON);
  const candidate = parseDiagnosticMetadata(candidateJSON);

  const baselineMap = new Map(baseline.modules.map((m) => [m.name, m]));
  const candidateMap = new Map(candidate.modules.map((m) => [m.name, m]));
  const allNames = Array.from(new Set([...baselineMap.keys(), ...candidateMap.keys()])).sort();

  const moduleDiffs: DiagnosticModuleDiff[] = allNames.map(name => {
    const b = baselineMap.get(name);
    const c = candidateMap.get(name);
    const isAdded = !b && !!c;
    const isRemoved = !!b && !c;

    let statusChange: DiagnosticModuleDiff['statusChange'] = 'UNCHANGED';
    let artifactsChanged = false;

    if (b && c) {
      if (b.status !== 'PASS' && c.status === 'PASS') {
        statusChange = 'RECOVERED';
      } else if (b.status === 'PASS' && c.status !== 'PASS') {
        statusChange = 'FAILED';
      } else if (b.status !== c.status) {
        statusChange = 'CHANGED';
      }

      const bArtifacts = b.artifactPaths.join('|');
      const cArtifacts = c.artifactPaths.join('|');
      if (bArtifacts !== cArtifacts) {
        artifactsChanged = true;
      }
    }

    return {
      name,
      isAdded,
      isRemoved,
      baseline: b,
      candidate: c,
      statusChange,
      artifactsChanged
    };
  });

  return {
    baselineSummary: baseline.summary,
    candidateSummary: candidate.summary,
    moduleDiffs
  };
}
