# repodash

[![npm version](https://img.shields.io/npm/v/repodash.svg)](https://www.npmjs.com/package/repodash)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Interactive TUI for checking Git repository health.

`repodash` analyzes local Git repositories and public GitHub repositories, then shows activity trends, contributor concentration, file churn, language mix, and a weighted health score in a terminal dashboard.

It is meant for maintainers, contributors, reviewers, and anyone trying to understand how healthy a repository looks before spending more time on it.

**Quick links:** [Why repodash](#why-repodash) | [Install](#install) | [Quick Start](#quick-start) | [Health Score](#health-score) | [Development](#development)

<!-- screenshot here -->

## Why repodash

Many repository tools stop at a snapshot. `repodash` is for cases where you want a little more context.

Use it when you want to answer questions like:

- Is this repository actively maintained right now, or just historically popular?
- Is the contributor base healthy, or is the project relying on one person?
- Which files and directories absorb the most maintenance effort?
- Does this repo look stable enough to adopt or contribute to?
- Can I export the findings into a report for review or onboarding?

In practice, that makes it useful for open-source evaluation, dependency reviews, team handoffs, and routine repository maintenance.

## Highlights

- Interactive TUI instead of a one-shot summary.
- Weighted health score across activity, community, documentation, maintenance, and security signals.
- Supports both local Git repositories and public GitHub repositories.
- Export to Markdown or JSON for sharing, automation, and archival.
- Multi-view workflow with focused tabs for Overview, Activity, Contributors, Files, and Health.

## repodash vs onefetch

`onefetch` is excellent when you want a fast repository snapshot. `repodash` is aimed at exploring repository health over time.

| Capability | repodash | onefetch |
| --- | --- | --- |
| Interactive multi-tab TUI | Yes | No |
| Repository health score | Yes | No |
| Public GitHub repository mode | Yes | Limited |
| Markdown report export | Yes | No |
| JSON output for scripting | Yes | Limited |
| Contributor concentration analysis | Yes | No |
| File churn view | Yes | No |

## Install

```bash
npm install -g repodash
```

Or run it without installing:

```bash
npx repodash
```

## Quick Start

Analyze the current repository:

```bash
repodash
```

Analyze another local repository:

```bash
repodash ../my-project
```

Analyze a public GitHub repository:

```bash
repodash github:microsoft/vscode
```

Export a Markdown report instead of launching the TUI:

```bash
repodash github:microsoft/vscode --export report.md
```

Print machine-readable JSON:

```bash
repodash . --json
```

Ignore cache and fetch fresh GitHub data:

```bash
repodash github:microsoft/vscode --no-cache
```

## Views

### Overview

See repository identity, age, last update, top-level stats, language mix, and the overall health score.

### Activity

Inspect a 52-week activity heatmap and a 12-month commit trend.

### Contributors

Review bus factor, top contributors, and contribution concentration.

### Files

See churn-heavy files, active directories, and file type distribution.

### Health

Break down the total score into five dimensions and review ranked insights.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Tab` | Cycle views |
| `1-5` | Jump to a specific tab |
| `j` / `Down` | Scroll down |
| `k` / `Up` | Scroll up |
| `r` | Refresh and re-analyze |
| `e` | Export `repodash-report.md` in the current directory |
| `q` / `Ctrl+C` | Quit |

## Health Score

The final score is weighted across five dimensions:

| Dimension | What it captures |
| --- | --- |
| Activity | Commit recency and recent momentum |
| Community | Bus factor, contributor count, and contributor freshness |
| Documentation | README, LICENSE, and contributor-facing project docs |
| Maintenance | Issue and PR upkeep signals, plus ongoing repository maintenance |
| Security | Lockfiles, Dependabot, and dependency hygiene signals |

Score interpretation:

- `80-100`: Strong health. The repository looks active and reasonably well maintained.
- `60-79`: A good baseline, but some areas deserve attention.
- `40-59`: Clear risk signals or missing process/documentation.
- `0-39`: High-risk repository with major sustainability concerns.

## GitHub Token

GitHub mode works without authentication, but anonymous requests have a much lower API limit.

Set a token for a higher rate limit:

```bash
set GITHUB_TOKEN=your_token_here
repodash github:microsoft/vscode
```

Or pass it directly:

```bash
repodash github:microsoft/vscode --token your_token_here
```

If you plan to inspect multiple repositories or larger public projects, using a token is recommended.

## Development

### Local Test Steps

1. In the project root, run `npm run build`.
2. Run `npm link`.
3. Change into any directory that contains a Git repository.
4. Run `repodash` to inspect the local repository.
5. Run `repodash github:microsoft/vscode` to test GitHub mode.
6. Run `repodash --export test-report.md` to test Markdown export.

### npm Publish Checklist

- [ ] `dist/index.js` first line is `#!/usr/bin/env node`
- [ ] `package.json` includes `"files": ["dist", "README.md"]`
- [ ] `npm run build` completes without errors
- [ ] `package.json` version is correct
- [ ] Run `npm login`
- [ ] Publish with `npm publish --access public`
- [ ] Verify with `npx repodash --version`

## Contributing

Issues, bug reports, README improvements, scoring changes, and UI polish are all welcome.

If you want to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Run `npm install` and `npm run build`.
4. Test both local mode and GitHub mode.
5. Open a pull request with a short explanation of the change and why it helps.

If you change the scoring logic or report output, include a before/after example so the behavior is easy to review.

## Inspiration

This README borrows a few structural ideas from strong open-source project pages:

- [Glow](https://github.com/charmbracelet/glow) for a clear opening section.
- [lazygit](https://github.com/jesseduffield/lazygit) for clear install and usage flow.
- [pnpm](https://github.com/pnpm/pnpm) for a more direct explanation of differences.
- [bat](https://github.com/sharkdp/bat) for practical feature explanation and approachable structure.

## License

MIT
