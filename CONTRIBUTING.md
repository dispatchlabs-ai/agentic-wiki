# Contributing

Chris Reynolds maintains this project, affiliated with Dispatch Labs AI. Discuss
large changes with the maintainer before implementing them. Small fixes should
explain the problem, resulting behavior, and relevant verification.

Use Linux, Node 24.19 or later, Git, and util-linux `flock`. Run `npm ci` and
`npm run check`. Tests use temporary repositories and synthetic records. Never
submit private wiki content, real agent traces, credentials, or customer data.

Submit changes through pull requests. Maintainer review and passing checks are
required before merging. Preserve upstream attribution. Contributions are licensed
under MIT; contributors retain their copyright. No CLA, copyright assignment, or
DCO sign-off is required.

AI-assisted contributions are welcome. Disclose material AI assistance and take
responsibility for understanding and verifying the submitted code. Avoid automated
issue or pull-request spam. Treat people respectfully and keep discussions focused
on the work. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Start with [contributor priorities and contracts](docs/contributor-guide.md) for
small scoped improvements, format fixtures, and acceptance criteria. Browser work
also needs `npx playwright install chromium` and `npm run test:browser`.
