import React from 'react';
import {
  DiagnosticMetadataView,
  parseDiagnosticMetadata,
} from '../utils/diagnosticMetadata';

const Diagnostics: React.FC = () => {
  const [metadataText, setMetadataText] = React.useState('');
  const [result, setResult] = React.useState<DiagnosticMetadataView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const parseMetadata = React.useCallback(() => {
    try {
      setResult(parseDiagnosticMetadata(metadataText));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [metadataText]);

  return (
    <div className="diagnostics-page">
      <div className="diagnostics-header">
        <div>
          <h2>Diagnostic Metadata</h2>
          <p className="diagnostics-subtitle">
            Inspect build diagnostic JSON before attaching artifacts to a review.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={parseMetadata}
          disabled={!metadataText.trim()}
        >
          Parse JSON
        </button>
      </div>

      <textarea
        className="diagnostics-input"
        value={metadataText}
        onChange={(event) => setMetadataText(event.target.value)}
        spellCheck={false}
        placeholder="Paste diagnostic/build-<commit>.json here"
      />

      {error && <div className="diagnostics-error">{error}</div>}

      {result && (
        <div className="diagnostics-results">
          <div className="diagnostics-summary">
            <div>
              <span className="diagnostics-label">Commit</span>
              <strong>{result.summary.commit ?? 'unknown'}</strong>
            </div>
            <div>
              <span className="diagnostics-label">Modules</span>
              <strong>{result.summary.totalModules}</strong>
            </div>
            <div>
              <span className="diagnostics-label">Passed</span>
              <strong>{result.summary.passed}</strong>
            </div>
            <div>
              <span className="diagnostics-label">Failed</span>
              <strong className={result.summary.failed > 0 ? 'diagnostics-failed' : ''}>
                {result.summary.failed}
              </strong>
            </div>
            <div>
              <span className="diagnostics-label">Artifacts</span>
              <strong className={result.summary.missingDiagnosticArtifacts ? 'diagnostics-failed' : ''}>
                {result.summary.diagnosticArtifacts.length || 'missing'}
              </strong>
            </div>
          </div>

          <div className="diagnostics-artifacts">
            {result.summary.diagnosticArtifacts.map((artifact) => (
              <code key={artifact}>{artifact}</code>
            ))}
          </div>

          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Command</th>
                  <th>Duration</th>
                  <th>Artifacts</th>
                </tr>
              </thead>
              <tbody>
                {result.modules.map((module) => (
                  <tr
                    key={module.name}
                    className={
                      module.status === 'FAIL' || module.missingArtifact
                        ? 'diagnostics-row-failed'
                        : undefined
                    }
                  >
                    <td>{module.name}</td>
                    <td>{module.status}</td>
                    <td>{module.command ?? '-'}</td>
                    <td>
                      {typeof module.durationSeconds === 'number'
                        ? `${module.durationSeconds.toFixed(3)}s`
                        : '-'}
                    </td>
                    <td>
                      {module.artifactPaths.length > 0 ? (
                        module.artifactPaths.map((artifact) => (
                          <code key={artifact}>{artifact}</code>
                        ))
                      ) : (
                        <span className="diagnostics-muted">no artifact path</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Diagnostics;
