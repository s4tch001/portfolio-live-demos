# Repository and toolchain

## Supported versions

- Node.js: major version 24, an LTS release line
- npm: major version 11
- Git default branch: main
- Intended private remote: https://github.com/s4tch001/portfolio-live-demos

The .nvmrc file lets Netlify and local version managers select Node.js 24. The package.json engines and devEngines fields reject unsupported major versions. packageManager records the npm version used to create the initial lockfile.

## Local workflow

1. Select Node.js 24 with the version manager of your choice.
2. Install exactly from package-lock.json with npm ci.
3. Run npm run check before and after every migration change.
4. Never place credentials in Git-tracked files; use local ignored environment files and deployment-platform secrets.

## Automated checks

The GitHub Actions workflow has read-only repository permissions, uses immutable full commit SHAs for external actions, disables persisted checkout credentials, installs from the lockfile without lifecycle scripts, runs both repository guards, and audits the complete dependency graph.

The local check verifies that all six protected repositories still match their Windows baseline. CI cannot mount those local directories, so check:ci validates the tracked baseline structure and scans only the checked-out workspace. It also verifies the expected GitHub repository and allowed main/pull-request ref before accepting a detached checkout.

Dependabot checks the npm dependency graph and GitHub Actions weekly. Its pull requests must still pass review and automated checks.

## Netlify monorepo invariant

For all five Netlify sites, leave Base directory unset so it defaults to the repository root. Set Package directory to the matching apps/cn, apps/rcmi, apps/hours, apps/payroll, or apps/travels directory. This keeps dependency installation at the workspace root and ensures Netlify reads the root .nvmrc, .npmrc, package.json, and package-lock.json. This setting will be verified again during the deployment phase.
