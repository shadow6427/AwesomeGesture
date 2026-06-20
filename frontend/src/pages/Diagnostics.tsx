import React from 'react';
import {
  DiagnosticMetadataView,
  DiagnosticMetadataCompareView,
  parseDiagnosticMetadata,
  compareDiagnosticMetadata,
} from '../utils/diagnosticMetadata';

const Diagnostics: React.FC = () => {
  const [isCompareMode, setIsCompareMode] = React.useState(false);
  const [metadataText, setMetadataText] = React.useState('');
  const [candidateText, setCandidateText] = React.useState('');
  const [result, setResult] = React.useState<DiagnosticMetadataView | null>(null);
  const [compareResult, setCompareResult] = React.useState<DiagnosticMetadataCompareView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const parseMetadata = React.useCallback(() => {
    try {
      if (isCompareMode) {
        setCompareResult(compareDiagnosticMetadata(metadataText, candidateText));
        setResult(null);
      } else {
        setResult(parseDiagnosticMetadata(metadataText));
        setCompareResult(null);
      }
      setError(null);
    } catch (err) {
      setResult(null);
      setCompareResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [metadataText, candidateText, isCompareMode]);

  const canParse = isCompareMode ? (metadataText.trim() && candidateText.trim()) : metadataText.trim();

  return (
    <div className="diagnostics-page">
      <div className="diagnostics-header">
        <div>
          <h2>Diagnostic Metadata</h2>
          <p className="diagnostics-subtitle">
            Inspect build diagnostic JSON before attaching artifacts to a review.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <input 
              type="checkbox" 
              checked={isCompareMode} 
              onChange={(e) => setIsCompareMode(e.target.checked)} 
            />
            Compare Mode
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={parseMetadata}
          disabled={!canParse}
        >
          Parse JSON
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexDirection: isCompareMode ? 'row' : 'column' }}>
        <textarea
          style={{ flex: 1, minHeight: '150px' }}
          className="diagnostics-input"
          value={metadataText}
          onChange={(event) => setMetadataText(event.target.value)}
          spellCheck={false}
          placeholder={isCompareMode ? "Paste baseline diagnostic JSON here" : "Paste diagnostic/build-<commit>.json here"}
        />
        {isCompareMode && (
          <textarea
            style={{ flex: 1, minHeight: '150px' }}
            className="diagnostics-input"
            value={candidateText}
            onChange={(event) => setCandidateText(event.target.value)}
            spellCheck={false}
            placeholder="Paste candidate diagnostic JSON here"
          />
        )}
      </div>

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

      {compareResult && (
        <div className="diagnostics-results">
          <div className="diagnostics-summary">
            <div>
              <span className="diagnostics-label">Baseline Commit</span>
              <strong>{compareResult.baselineSummary?.commit ?? 'unknown'}</strong>
            </div>
            <div>
              <span className="diagnostics-label">Candidate Commit</span>
              <strong>{compareResult.candidateSummary?.commit ?? 'unknown'}</strong>
            </div>
          </div>

          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Status Change</th>
                  <th>Command</th>
                  <th>Artifacts Change</th>
                </tr>
              </thead>
              <tbody>
                {compareResult.moduleDiffs.map((diff) => (
                  <tr
                    key={diff.name}
                    className={
                      diff.statusChange === 'FAILED'
                        ? 'diagnostics-row-failed'
                        : diff.statusChange === 'RECOVERED'
                        ? 'diagnostics-row-success'
                        : diff.artifactsChanged || diff.statusChange === 'CHANGED'
                        ? 'diagnostics-row-changed'
                        : undefined
                    }
                  >
                    <td>{diff.name}</td>
                    <td>
                      {diff.isAdded ? 'ADDED' : diff.isRemoved ? 'REMOVED' : diff.statusChange}
                      {!diff.isAdded && !diff.isRemoved && diff.statusChange !== 'UNCHANGED' && (
                        <span> ({diff.baseline?.status} &rarr; {diff.candidate?.status})</span>
                      )}
                    </td>
                    <td>{diff.candidate?.command ?? diff.baseline?.command ?? '-'}</td>
                    <td>
                      {diff.artifactsChanged ? (
                        <strong>Changed</strong>
                      ) : (
                        <span className="diagnostics-muted">Unchanged</span>
                      )}
                      <div>
                        {diff.candidate?.artifactPaths.map(a => <code key={a}>{a}</code>) ?? diff.baseline?.artifactPaths.map(a => <code key={a}>{a}</code>)}
                      </div>
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
