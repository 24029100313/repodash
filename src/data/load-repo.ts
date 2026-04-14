import { fetchGitHubRepository, type FetchGitHubRepositoryOptions } from "./github-fetcher.js";
import { analyzeLocalRepository } from "./local-analyzer.js";
import type { AnalysisSource, RepoData } from "./types.js";

export interface LoadRepoOptions extends FetchGitHubRepositoryOptions {}

export async function loadRepoData(
  source: AnalysisSource,
  options: LoadRepoOptions = {},
): Promise<RepoData> {
  if (source.mode === "github") {
    return fetchGitHubRepository(source.input, options);
  }

  return analyzeLocalRepository(source.repoPath);
}
