#!/usr/bin/env node

import path from "node:path";

import React from "react";
import { Command } from "commander";
import { render } from "ink";

import { App } from "./app.js";
import { loadRepoData } from "./data/load-repo.js";
import type { AnalysisSource } from "./data/types.js";
import { exportJson, exportMarkdown } from "./export.js";

interface CliOptions {
  export?: string;
  json?: boolean;
  cache?: boolean;
  token?: string;
}

function normalizeSource(input: string): AnalysisSource {
  const githubMatch = /^github:([^/]+)\/([^/]+)$/.exec(input);

  if (githubMatch) {
    const [, owner, repo] = githubMatch;

    return {
      mode: "github",
      input,
      owner,
      repo,
      displayName: `${owner}/${repo}`,
    };
  }

  if (input.startsWith("github:")) {
    throw new Error("GitHub source must be in the form github:owner/repo");
  }

  const repoPath = path.resolve(input);

  return {
    mode: "local",
    input,
    repoPath,
    displayName: repoPath,
  };
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("repodash")
    .description("Interactive TUI dashboard for Git repository health")
    .version("0.1.0")
    .argument("[path_or_github]", "local path or github:owner/repo", ".")
    .option("--export <file>", "export a Markdown report and exit")
    .option("--json", "print repository data as JSON and exit")
    .option("--no-cache", "ignore cache and fetch fresh data")
    .option("--token <token>", "GitHub token override");

  program.action(async (sourceInput: string, options: CliOptions) => {
    try {
      if (options.json && options.export) {
        throw new Error("Choose either --json or --export, not both.");
      }

      const source = normalizeSource(sourceInput);
      const noCache = options.cache === false;

      if (options.json || options.export) {
        const repo = await loadRepoData(source, {
          noCache,
          token: options.token,
        });

        if (options.json) {
          process.stdout.write(exportJson(repo));
          return;
        }

        if (options.export) {
          await exportMarkdown(repo, options.export);
          process.stdout.write(`Exported report to ${path.resolve(options.export)}\n`);
          return;
        }
      }

      render(
        <App
          source={source}
          noCache={noCache}
          token={options.token}
        />,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid source value";
      program.error(message);
    }
  });

  await program.parseAsync(process.argv);
}

void main();
