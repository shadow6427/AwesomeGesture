## Summary

<!-- Required: Briefly describe what this PR does and why. -->

## Changes

<!-- Required: List the notable code, docs, test, or configuration changes. -->

## Testing

<!-- Required: Describe what you ran locally and the results. Include relevant commands. Verifying the build locally is required. -->
<!-- Diagnostic expectation: run `python3 build.py`, commit the generated diagnostic/build-<commit>.logd file, and commit its matching diagnostic/build-<commit>-metadata.json file. Do not submit the tracked build-00000000 stub. -->

## Checklist

- [ ] Relevant modules affected by these changes build locally
- [ ] Tests pass locally
- [ ] Diagnostic build log is committed in this PR
- [ ] Diagnostic metadata matches the committed build log and is not the build-00000000 stub
- [ ] Documentation has been updated, if applicable
- [ ] Configuration or schema changes are documented, if applicable
- [ ] No generated build artifacts are committed, except the required diagnostic build log
- [ ] Changes are scoped to the PR purpose and avoid unrelated cleanup
- [ ] Security, privacy, and error-handling implications have been considered

---

- [ ] I would like to request that my diagnostic build log is removed before merging
