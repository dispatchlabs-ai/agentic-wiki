# Versioning and releases

Agentic Wiki follows [Semantic Versioning 2.0.0](https://semver.org/).
The public contract covers the documented HTTP, MCP and WebMCP APIs, CLI commands,
configuration, article format, and persisted trace and edit-receipt formats.
Internal modules and disposable indexes/caches are not public APIs. Raising the
minimum runtime or dropping a supported platform is a breaking change.

## Choosing a version

During initial development (`0.y.z`), this project uses patch bumps for compatible
fixes and additions, and minor bumps for breaking changes (resetting patch to zero).
This is our explicit pre-1.0 convention; SemVer does not promise a stable API for
major version zero. Document migrations for every breaking change.

From `1.0.0`, use patch for compatible fixes, minor for compatible features or
deprecations, and major for breaking changes. Reset lower components when bumping.
Use `-alpha.N`, `-beta.N`, or `-rc.N` only for deliberate previews of an upcoming
version. A normal `0.y.z` release remains initial-development software.

`0.1.0` completes the earlier `0.1.0-alpha.1` preview with the accumulated fixes
and additions. It does not imply production readiness.

## Publishing a release

1. Work from public `main`; never merge private engineering history into it.
   Maintainer changes can push directly to `main`; outside contributors use PRs.
2. Describe changes since the previous release in `CHANGELOG.md`, including
   compatibility and migration notes. Update `package.json`, both root version
   fields in `package-lock.json`, and the README status together.
3. Run `npm ci`, `npm run check`, `npm run test:browser`, and
   `npm audit --omit=dev --audit-level=high` using synthetic data. Review the diff
   and public source archive for unintended content. Keep dependencies locked.
4. Commit and push; wait for the Linux/macOS runtime matrix and browser CI to pass
   on that exact commit before tagging. Do not treat a queued CI run as a pass.
5. Create an SSH-signed annotated `vX.Y.Z` tag on that commit, verify its signature,
   and push only that tag. Publish matching GitHub release notes from the changelog.
   Mark preview versions as GitHub prereleases; normal versions are regular releases.
6. Verify the remote tag, release version, target commit, and publication status.
   Report the release link and check results. A push to `main` alone is not a release.

Released tags and artifacts are immutable. Correct a released defect in a new
version; never move or replace a published tag. Several related commits may form
one release. Completed user-visible work must not silently remain unversioned.
Source releases do not authorize npm publication or deployment of running instances.
