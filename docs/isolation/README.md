# Isolation boundary

The five original project directories are read-only source references. The Portfolio directory is also read-only until its explicitly approved final integration phase. Only this live-demo workspace may be changed during the migration phases before that point.

The baseline file records each repository branch, commit, tree, working-tree status, and SHA-256 hashes for selected safe source files. It deliberately does not read or hash environment files, databases, uploads, or other runtime data.

Before and after every future import:

1. Run npm run audit:isolation from the workspace root.
2. Copy only paths permitted by config/source-import-policy.json.
3. Resolve every flagged path or content rule without exposing the matched value.
4. Confirm all original repositories still match docs/isolation/source-baseline.json.

If an original repository is intentionally changed outside this demo effort, review that change separately before updating its baseline. Never weaken the baseline merely to silence an unexpected mismatch.

