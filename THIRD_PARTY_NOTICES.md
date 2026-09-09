# Third-party provenance

The original engine was generalized from Chris Reynolds's own private wiki code.
Its original code and synthetic examples are released under the root MIT License.
No private articles, original session archives, deployment configuration, or
third-party source trees are included in this source release.

Codex and pi are names of external agent harnesses whose JSONL records this engine
can interpret. This project is independent and is not endorsed by their maintainers.
It does not bundle either harness, their logos, or a model service.

Runtime and development dependencies are separately licensed, downloaded by
`npm ci`, and pinned by package-lock.json. Their own license notices remain in the
installed packages. The lockfile records resolved versions, integrity values, and
license identifiers. The dependency inventory is in
[dependency review](docs/dependencies.md). If distributing a bundled application or
container, include the applicable dependency license texts and review that artifact
separately; the root MIT notice does not replace upstream notices.
