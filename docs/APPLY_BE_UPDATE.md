# Apply the BE dev compatibility update

Update date: 15 October 2026.
Backend baseline: `de7b083a21c18bb0be2ea41e7c93a720c5c1670f` (PR26/PR27).

The ZIP contains the complete updated source and `FE1_BE_dev_de7b083.patch`.
For an existing FE checkout, extract the ZIP into a temporary folder and copy
only the patch file into your FE repository root. This preserves your local
changes in other files. The patch changes auth UI, auth/browser tests and docs;
dependencies and backend/database files are unchanged.

In the VS Code PowerShell terminal at the FE repository root:

```powershell
git apply --check .\FE1_BE_dev_de7b083.patch
```

If this exits without an error, apply it:

```powershell
git apply .\FE1_BE_dev_de7b083.patch
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

If `--check` reports a mismatch, stop before applying and compare the named
files with your own edits. Do not force the patch or overwrite the entire repo.
Changes are designed against the original delivered FE1 source. No dependency
change is required, so an existing node_modules install can be reused.

Run browser tests if Chromium is already installed:

```powershell
npm.cmd run test:e2e
```

Review `git diff` and commit the implementation/docs on your FE feature branch.
Keep `.env`, node_modules, dist and the copied patch out of the commit. Suggested
summary: `fix(fe1): align auth validation with backend dev`.

The complete source in this ZIP is useful for a fresh checkout. For an existing
checkout, use the checked patch instead of copying all files over local work.
