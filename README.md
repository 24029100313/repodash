# repodash

[![npm version](https://img.shields.io/npm/v/repodash.svg)](https://www.npmjs.com/package/repodash)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Interactive terminal intelligence for Git repository health.

`repodash` turns a repository into a navigable health dashboard. It works with local Git repositories and public GitHub repositories, then surfaces activity trends, contributor concentration, file churn, language mix, and a weighted health score in one terminal-native workflow.

> Built for maintainers, contributors, reviewers, and anyone evaluating whether a repository is active, healthy, and safe to depend on.

**Quick links:** [Why repodash](#why-repodash) | [Install](#install) | [Quick Start](#quick-start) | [Health Score](#health-score) | [Development](#development)

<!-- screenshot here -->

## Why repodash

Repository tooling usually stops at a snapshot. `repodash` is meant to help you investigate.

Use it when you want to answer questions like:

- Is this repository actively maintained right now, or just historically popular?
- Is the contributor base healthy, or is the project relying on one person?
- Which files and directories absorb the most maintenance effort?
- Does this repo look mature enough to adopt, contribute to, or benchmark against?
- Can I export the findings into a report for review, onboarding, or due diligence?

That makes `repodash` useful for open-source evaluation, dependency reviews, engineering management, technical due diligence, and internal platform stewardship.

## Highlights

- Interactive TUI instead of a one-shot terminal summary.
- Weighted health score across activity, community, documentation, maintenance, and security signals.
- Supports both local Git repositories and public GitHub repositories.
- Export to Markdown or JSON for sharing, automation, and archival.
- Multi-view workflow with focused tabs for Overview, Activity, Contributors, Files, and Health.

## repodash vs onefetch

`onefetch` is excellent when you want a fast repository snapshot. `repodash` is optimized for deeper inspection and ongoing health analysis.

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

See repository identity, age, last update, top-level stats, language mix, and the overall health score at a glance.

### Activity

Inspect a 52-week activity heatmap and 12-month commit trend to spot momentum, slowdowns, and bursts of work.

### Contributors

Review bus factor, top contributors, and contribution concentration to understand ownership risk.

### Files

Surface churn-heavy files, active directories, and file type distribution to locate maintenance hotspots.

### Health

Break down the total score into five dimensions and review ranked insights from critical to good.

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

- `80-100`: Strong health. Active, maintainable, and well-supported.
- `60-79`: Good baseline with some areas that deserve attention.
- `40-59`: Noticeable risk signals or missing process/documentation.
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

If you plan to inspect multiple repositories or large public projects, using a token is strongly recommended.

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

Issues, bug reports, README polish, scoring improvements, and UI ideas are all welcome.

If you want to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Run `npm install` and `npm run build`.
4. Test both local mode and GitHub mode.
5. Open a pull request with a short explanation of the change and the motivation behind it.

If you change the scoring logic or report output, include a before/after example so the behavior is easy to review.

## Inspiration

This README structure borrows patterns from a few strong open-source projects:

- [Glow](https://github.com/charmbracelet/glow) for strong first-screen product framing.
- [lazygit](https://github.com/jesseduffield/lazygit) for clear install and usage flow.
- [pnpm](https://github.com/pnpm/pnpm) for sharper differentiator framing.
- [bat](https://github.com/sharkdp/bat) for practical feature explanation and approachable structure.

## License

MIT
