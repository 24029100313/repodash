[![npm version](https://img.shields.io/npm/v/repodash.svg)](https://www.npmjs.com/package/repodash)
[![license](https://img.shields.io/npm/l/repodash.svg)](https://github.com/24029100313/repodash/blob/main/LICENSE)

# repodash

Interactive terminal dashboard for Git repository health. `repodash` helps you inspect activity, contributor balance, file churn, and a multi-dimensional health score for both local Git repositories and public GitHub repos.

<!-- screenshot here -->

## Why repodash

- Interactive TUI workflow instead of a single static snapshot, so you can move between overview, activity, contributors, files, and health views.
- Repository health scoring that turns raw Git and GitHub signals into actionable activity, community, documentation, maintenance, and security feedback.
- GitHub support in addition to local repository analysis, which makes it useful for quick remote checks before cloning.
- Built-in Markdown and JSON export for reports, sharing, and automation.
- More operational than `onefetch`: it focuses on repository maintainability and team risk, not just codebase metadata.

## Install

```bash
npm install -g repodash

# or run without installing globally
npx repodash
```

## Usage

```bash
# analyze the current local repository
repodash

# analyze a different local repository
repodash ./path/to/repo

# analyze a public GitHub repository
repodash github:microsoft/vscode

# export a Markdown report instead of launching the TUI
repodash github:microsoft/vscode --export test-report.md
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle to the next view |
| `1-5` | Jump directly to Overview, Activity, Contributors, Files, or Health |
| `j` / `Down` | Scroll down |
| `k` / `Up` | Scroll up |
| `r` | Refresh and re-run analysis |
| `e` | Export `repodash-report.md` in the current working directory |
| `q` / `Ctrl+C` | Quit |

## Health Score

Each dimension is scored from `0` to `100`, then combined into the overall repository health score.

| Dimension | What it measures |
|-----------|------------------|
| Activity | Recent commits, momentum, and recent trend changes |
| Community | Contributor count, bus factor, and contributor onboarding health |
| Documentation | README, license, contributing docs, and documentation depth |
| Maintenance | Issue and PR flow, especially for GitHub repositories |
| Security | Lockfiles, dependency hygiene, and Dependabot-style update signals |

| Score Range | Meaning |
|-------------|---------|
| `80-100` | Healthy signal with low immediate risk |
| `60-79` | Good baseline, but worth monitoring |
| `40-59` | Noticeable weaknesses that should be addressed |
| `0-39` | High risk or major repository hygiene gaps |

## GitHub Token

GitHub mode works without authentication, but the anonymous API limit is much lower. For better reliability, provide a token:

```bash
export GITHUB_TOKEN=your_token_here
repodash github:microsoft/vscode
```

Or pass it directly:

```bash
repodash github:microsoft/vscode --token your_token_here
```

## Contributing

Issues and pull requests are welcome. If you want to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Run the local test steps below.
4. Open a pull request with a short summary of the change and how you verified it.

## Local Test Steps

1. In the project root, run `npm run build`.
2. Run `npm link` to create a global development link.
3. Change into any directory that already contains a Git repository.
4. Run `repodash` and verify the TUI launches and tabs render.
5. Run `repodash github:microsoft/vscode` to test GitHub mode.
6. Run `repodash --export test-report.md` to test Markdown export.

## npm Publish Checklist

- [ ] `dist/index.js` first line is `#!/usr/bin/env node`
- [ ] `package.json` contains `"files": ["dist", "README.md"]`
- [ ] `npm run build` completes without errors
- [ ] `version` is set correctly
- [ ] Log in to npm with `npm login`
- [ ] Publish with `npm publish --access public`
- [ ] Verify with `npx repodash --version`

## License

MIT
