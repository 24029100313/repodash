import path from "node:path";

import Conf from "conf";
import {
  format,
  startOfISOWeek,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { Octokit } from "@octokit/rest";

import { calculateBusFactor } from "./local-analyzer.js";
import { scoreRepositoryHealth } from "./health-scorer.js";
import type {
  Contributor,
  MonthlyActivity,
  RecentlyChangedDirStat,
  RepoData,
  RepoDataDraft,
  RepoSignals,
  WeeklyActivity,
} from "./types.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const REMOTE_RECENT_COMMIT_LIMIT = 15;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const cache = new Conf<Record<string, CachedRepoData>>({
  projectName: "repodash",
});

export interface FetchGitHubRepositoryOptions {
  noCache?: boolean;
  token?: string;
}

interface ParsedGithubInput {
  owner: string;
  repo: string;
}

interface BasicInfoResult {
  name: string;
  description: string;
  url: string;
  license: string | null;
  createdAt: Date;
  lastCommitAt: Date;
  defaultBranch: string;
  isPrivate: boolean;
  repoSizeMB: number;
  stars: number;
  forks: number;
  rawOpenIssues: number;
}

interface CommitActivityResult {
  weeklyActivity: WeeklyActivity[];
  monthlyActivity: MonthlyActivity[];
  activityWeeksAvailable: number;
}

interface IssueStatsResult {
  openIssues: number;
  closedIssues: number;
  openPRs: number;
  mergedPRs: number;
}

interface TreeStatsResult {
  fileCount: number;
  fileTypeCounts: Record<string, number>;
}

interface SerializedContributor
  extends Omit<Contributor, "firstCommit" | "lastCommit"> {
  firstCommit: string;
  lastCommit: string;
}

interface SerializedRecentlyChangedDirStat
  extends Omit<RecentlyChangedDirStat, "lastChangedAt"> {
  lastChangedAt: string;
}

interface SerializedRepoData
  extends Omit<
    RepoData,
    "createdAt" | "lastCommitAt" | "analyzedAt" | "contributors" | "recentlyChangedDirs"
  > {
  createdAt: string;
  lastCommitAt: string;
  analyzedAt: string;
  contributors: SerializedContributor[];
  recentlyChangedDirs: SerializedRecentlyChangedDirStat[];
}

interface CachedRepoData {
  expiresAt: string;
  data: SerializedRepoData;
}

interface DirectoryAccumulator {
  files: Set<string>;
  lastChangedAt: Date;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeRepoSegment(segment: string): string {
  return segment.replace(/\.git$/i, "").trim();
}

function decodeBase64Content(content: string): string {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function countWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).filter(Boolean).length;
}

function countPackageDependencies(packageJsonText: string): number | undefined {
  try {
    const parsed = JSON.parse(packageJsonText) as Record<string, unknown>;
    const dependencySections = [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.peerDependencies,
      parsed.optionalDependencies,
    ];

    return dependencySections.reduce((sum, section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return sum;
      }

      return sum + Object.keys(section as Record<string, unknown>).length;
    }, 0);
  } catch {
    return undefined;
  }
}

function toSerializedRepoData(data: RepoData): SerializedRepoData {
  return {
    ...data,
    createdAt: data.createdAt.toISOString(),
    lastCommitAt: data.lastCommitAt.toISOString(),
    analyzedAt: data.analyzedAt.toISOString(),
    contributors: data.contributors.map((contributor) => ({
      ...contributor,
      firstCommit: contributor.firstCommit.toISOString(),
      lastCommit: contributor.lastCommit.toISOString(),
    })),
    recentlyChangedDirs: data.recentlyChangedDirs.map((directory) => ({
      ...directory,
      lastChangedAt: directory.lastChangedAt.toISOString(),
    })),
  };
}

function fromSerializedRepoData(data: SerializedRepoData): RepoData {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    lastCommitAt: new Date(data.lastCommitAt),
    analyzedAt: new Date(data.analyzedAt),
    contributors: data.contributors.map((contributor) => ({
      ...contributor,
      firstCommit: new Date(contributor.firstCommit),
      lastCommit: new Date(contributor.lastCommit),
    })),
    recentlyChangedDirs: data.recentlyChangedDirs.map((directory) => ({
      ...directory,
      lastChangedAt: new Date(directory.lastChangedAt),
    })),
  };
}

function getLastPageFromLinkHeader(linkHeader?: string): number | null {
  if (!linkHeader) {
    return null;
  }

  const lastMatch = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(linkHeader);
  if (lastMatch) {
    return Number.parseInt(lastMatch[1], 10);
  }

  const nextMatch = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/.exec(linkHeader);
  if (nextMatch) {
    return Number.parseInt(nextMatch[1], 10);
  }

  return null;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

function shouldIgnoreRelativePath(relativePath: string): boolean {
  const segments = normalizeRelativePath(relativePath).split("/");
  return segments.some((segment) => IGNORED_DIRECTORIES.has(segment));
}

function getDirectoryFromGitPath(gitPath: string): string {
  const normalized = normalizeRelativePath(gitPath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ".";
}

function getFileTypeForFile(filePath: string): string {
  const baseName = path.basename(filePath);

  if (baseName === "Dockerfile") {
    return "Dockerfile";
  }

  if (baseName === "Makefile") {
    return "Makefile";
  }

  const extension = path.extname(baseName).toLowerCase();
  return extension || "[no extension]";
}

function buildEmptyWeeklyActivity(): WeeklyActivity[] {
  const now = new Date();
  return Array.from({ length: 52 }, (_, index) => {
    const weekDate = new Date(now);
    weekDate.setDate(now.getDate() - (51 - index) * 7);

    return {
      week: format(weekDate, "RRRR-II"),
      count: 0,
    };
  });
}

function buildEmptyMonthlyActivity(): MonthlyActivity[] {
  const currentMonthStart = startOfMonth(new Date());

  return Array.from({ length: 12 }, (_, index) => ({
    month: format(subMonths(currentMonthStart, 11 - index), "yyyy-MM"),
    count: 0,
  }));
}

function calculateActivityWeeksAvailableFromDates(commitDates: Date[]): number {
  if (commitDates.length === 0) {
    return 0;
  }

  const currentWeekStart = startOfISOWeek(new Date());
  const oldestVisibleWeek = startOfISOWeek(subWeeks(currentWeekStart, 51));
  let earliestCommit = commitDates[0] ?? oldestVisibleWeek;

  for (const commitDate of commitDates) {
    if (commitDate < earliestCommit) {
      earliestCommit = commitDate;
    }
  }

  const firstWeek = startOfISOWeek(
    earliestCommit > oldestVisibleWeek ? earliestCommit : oldestVisibleWeek,
  );
  const diffWeeks = Math.floor(
    (currentWeekStart.getTime() - firstWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  return Math.max(0, Math.min(52, diffWeeks + 1));
}

function buildCommitActivityFromDates(commitDates: Date[]): CommitActivityResult {
  const weeklyCounts = new Map<string, number>();
  const monthlyCounts = new Map<string, number>();
  const currentWeekStart = startOfISOWeek(new Date());
  const currentMonthStart = startOfMonth(new Date());

  for (const commitDate of commitDates) {
    const weekKey = format(commitDate, "RRRR-II");
    const monthKey = format(commitDate, "yyyy-MM");
    weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) ?? 0) + 1);
    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) ?? 0) + 1);
  }

  const weeklyActivity: WeeklyActivity[] = Array.from({ length: 52 }, (_, index) => {
    const weekStart = subWeeks(currentWeekStart, 51 - index);
    const week = format(weekStart, "RRRR-II");

    return {
      week,
      count: weeklyCounts.get(week) ?? 0,
    };
  });

  const monthlyActivity: MonthlyActivity[] = Array.from({ length: 12 }, (_, index) => {
    const monthStart = subMonths(currentMonthStart, 11 - index);
    const month = format(monthStart, "yyyy-MM");

    return {
      month,
      count: monthlyCounts.get(month) ?? 0,
    };
  });

  return {
    weeklyActivity,
    monthlyActivity,
    activityWeeksAvailable: calculateActivityWeeksAvailableFromDates(commitDates),
  };
}

async function fetchCommitActivityFromHistory(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<CommitActivityResult> {
  const oldestVisibleWeek = startOfISOWeek(subWeeks(new Date(), 51));
  const commitDates: Date[] = [];
  let page = 1;

  while (page <= 100) {
    const response = await octokit.repos.listCommits({
      owner,
      repo,
      since: oldestVisibleWeek.toISOString(),
      per_page: 100,
      page,
    });

    if (response.data.length === 0) {
      break;
    }

    for (const commit of response.data) {
      const isoDate =
        commit.commit.author?.date ?? commit.commit.committer?.date ?? null;

      if (!isoDate) {
        continue;
      }

      const commitDate = new Date(isoDate);
      if (!Number.isNaN(commitDate.getTime())) {
        commitDates.push(commitDate);
      }
    }

    if (response.data.length < 100) {
      break;
    }

    page += 1;
  }

  return buildCommitActivityFromDates(commitDates);
}

async function fetchTextContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    if (Array.isArray(response.data) || !("content" in response.data)) {
      return null;
    }

    if (typeof response.data.content !== "string") {
      return null;
    }

    return decodeBase64Content(response.data.content);
  } catch {
    return null;
  }
}

async function findFirstRemoteFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  candidates: string[],
): Promise<{ path: string; content: string } | null> {
  for (const candidate of candidates) {
    const content = await fetchTextContent(octokit, owner, repo, candidate);
    if (content !== null) {
      return { path: candidate, content };
    }
  }

  return null;
}

async function fetchReadmeContent(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const response = await octokit.repos.getReadme({ owner, repo });
    if (typeof response.data.content !== "string") {
      return null;
    }

    return decodeBase64Content(response.data.content);
  } catch {
    return null;
  }
}

export async function fetchRepoSignals(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoSignals> {
  const [readmeContent, contributing, changelog, packageJsonText, lockfileMatches, dependabotText] =
    await Promise.all([
      fetchReadmeContent(octokit, owner, repo),
      findFirstRemoteFile(octokit, owner, repo, [
        "CONTRIBUTING.md",
        "CONTRIBUTING",
        "CONTRIBUTING.txt",
      ]),
      findFirstRemoteFile(octokit, owner, repo, [
        "CHANGELOG.md",
        "CHANGELOG",
        "CHANGELOG.txt",
        "HISTORY.md",
      ]),
      fetchTextContent(octokit, owner, repo, "package.json"),
      Promise.all(
        [
          "package-lock.json",
          "npm-shrinkwrap.json",
          "yarn.lock",
          "pnpm-lock.yaml",
          "bun.lockb",
          "bun.lock",
        ].map(async (lockfile) =>
          (await fetchTextContent(octokit, owner, repo, lockfile)) !== null
            ? lockfile
            : null,
        ),
      ),
      (async () => {
        const yml = await fetchTextContent(
          octokit,
          owner,
          repo,
          ".github/dependabot.yml",
        );
        if (yml !== null) {
          return yml;
        }

        return fetchTextContent(
          octokit,
          owner,
          repo,
          ".github/dependabot.yaml",
        );
      })(),
    ]);

  const lockfiles = lockfileMatches.filter(
    (lockfile): lockfile is string => lockfile !== null,
  );

  return {
    readmeExists: readmeContent !== null,
    readmeWordCount: readmeContent ? countWords(readmeContent) : 0,
    hasContributing: contributing !== null,
    hasChangelog: changelog !== null,
    hasPackageJson: packageJsonText !== null,
    hasLockfile: lockfiles.length > 0,
    lockfiles,
    hasDependabot: dependabotText !== null,
    dependencyCount: packageJsonText
      ? countPackageDependencies(packageJsonText)
      : undefined,
  };
}

export async function fetchRateLimitRemaining(
  octokit: Octokit,
): Promise<number | undefined> {
  try {
    const response = await octokit.rateLimit.get();
    return response.data.resources.core.remaining;
  } catch {
    return undefined;
  }
}

function takeTopLanguages(input: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input)
      .sort(([, left], [, right]) => right - left)
      .slice(0, limit),
  );
}

async function requestWithRetry<T>(
  request: () => Promise<{ status: number; data: T }>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request();
    if (response.status !== 202) {
      return response.data;
    }

    if (attempt < 3) {
      await sleep(2000);
    }
  }

  throw new Error("GitHub statistics are still being generated. Please retry shortly.");
}

async function mapWithConcurrency<TInput, TResult>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(values.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < values.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), values.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export function parseGithubInput(input: string): ParsedGithubInput {
  const trimmed = input.trim();

  if (trimmed.startsWith("github:")) {
    return parseGithubInput(trimmed.slice("github:".length));
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsedUrl = new URL(trimmed);
    if (!/github\.com$/i.test(parsedUrl.hostname)) {
      throw new Error("Only github.com URLs are supported.");
    }

    const segments = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length < 2) {
      throw new Error("GitHub URL must include owner and repository.");
    }

    return {
      owner: segments[0],
      repo: normalizeRepoSegment(segments[1]),
    };
  }

  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length !== 2) {
    throw new Error("GitHub input must be in the form owner/repo.");
  }

  return {
    owner: segments[0],
    repo: normalizeRepoSegment(segments[1]),
  };
}

export function createOctokit(tokenOverride?: string): Octokit {
  const token = tokenOverride?.trim() || process.env.GITHUB_TOKEN?.trim();

  return new Octokit(
    {
      auth: token || undefined,
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    },
  );
}

export function getCacheKey(owner: string, repo: string): string {
  return `github.${owner.toLowerCase()}.${repo.toLowerCase()}`;
}

async function fetchDefaultBranchHeadDate(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<Date | null> {
  try {
    const response = await octokit.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: 1,
    });

    const commit = response.data[0];
    const isoDate =
      commit?.commit.author?.date ?? commit?.commit.committer?.date ?? null;

    return isoDate ? new Date(isoDate) : null;
  } catch {
    return null;
  }
}

async function estimatePaginatedTotal<TResponse>(
  request: () => Promise<{ data: TResponse[]; headers: { link?: unknown } }>,
): Promise<number> {
  const response = await request();
  const linkHeader =
    typeof response.headers.link === "string" ? response.headers.link : undefined;
  const lastPage = getLastPageFromLinkHeader(linkHeader);

  if (lastPage !== null) {
    return lastPage;
  }

  return response.data.length;
}

async function fetchTotalCommitCount(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<number> {
  try {
    return await estimatePaginatedTotal(() =>
      octokit.repos.listCommits({
        owner,
        repo,
        sha: branch,
        per_page: 1,
        page: 1,
      }),
    );
  } catch {
    return 0;
  }
}

async function fetchTotalContributorCount(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<number> {
  try {
    return await estimatePaginatedTotal(() =>
      octokit.repos.listContributors({
        owner,
        repo,
        per_page: 1,
        page: 1,
      }),
    );
  } catch {
    return 0;
  }
}

async function fetchTreeStats(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<TreeStatsResult> {
  try {
    const response = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    const fileTypeCounts: Record<string, number> = {};
    let fileCount = 0;

    for (const item of response.data.tree) {
      if (item.type !== "blob" || !item.path || shouldIgnoreRelativePath(item.path)) {
        continue;
      }

      fileCount += 1;
      const fileType = getFileTypeForFile(item.path);
      fileTypeCounts[fileType] = (fileTypeCounts[fileType] ?? 0) + 1;
    }

    return {
      fileCount,
      fileTypeCounts,
    };
  } catch {
    return {
      fileCount: 0,
      fileTypeCounts: {},
    };
  }
}

export async function fetchBasicInfo(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<BasicInfoResult> {
  const { data } = await octokit.repos.get({ owner, repo });
  const lastCommitAt =
    (await fetchDefaultBranchHeadDate(octokit, owner, repo, data.default_branch)) ??
    new Date(data.pushed_at ?? data.updated_at ?? data.created_at);

  return {
    name: data.name,
    description: data.description ?? "",
    url: data.html_url,
    license:
      data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION"
        ? data.license.spdx_id
        : data.license?.name ?? null,
    createdAt: new Date(data.created_at),
    lastCommitAt,
    defaultBranch: data.default_branch,
    isPrivate: data.private,
    repoSizeMB: roundToTwo(data.size / 1024),
    stars: data.stargazers_count,
    forks: data.forks_count,
    rawOpenIssues: data.open_issues_count,
  };
}

export async function fetchLanguages(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Record<string, number>> {
  const { data } = await octokit.repos.listLanguages({ owner, repo });
  return takeTopLanguages(data as Record<string, number>, 10);
}

interface ContributorCommitDetails {
  name: string;
  email: string;
  firstCommit: Date;
  lastCommit: Date;
}

async function fetchContributorCommitDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  author: string,
): Promise<ContributorCommitDetails | null> {
  try {
    const latestResponse = await octokit.repos.listCommits({
      owner,
      repo,
      author,
      per_page: 1,
      page: 1,
    });

    const latestCommit = latestResponse.data[0];
    if (!latestCommit) {
      return null;
    }

    const lastPage = getLastPageFromLinkHeader(
      typeof latestResponse.headers.link === "string"
        ? latestResponse.headers.link
        : undefined,
    );

    const earliestResponse =
      lastPage && lastPage > 1
        ? await octokit.repos.listCommits({
            owner,
            repo,
            author,
            per_page: 1,
            page: lastPage,
          })
        : latestResponse;

    const earliestCommit = earliestResponse.data[0] ?? latestCommit;
    const lastCommitDate =
      latestCommit.commit.author?.date ?? latestCommit.commit.committer?.date;
    const firstCommitDate =
      earliestCommit.commit.author?.date ?? earliestCommit.commit.committer?.date;

    return {
      name:
        latestCommit.commit.author?.name ??
        latestCommit.commit.committer?.name ??
        author,
      email:
        latestCommit.commit.author?.email ??
        earliestCommit.commit.author?.email ??
        "",
      firstCommit: new Date(firstCommitDate ?? latestCommit.commit.author?.date ?? new Date(0)),
      lastCommit: new Date(lastCommitDate ?? earliestCommit.commit.author?.date ?? new Date(0)),
    };
  } catch {
    return null;
  }
}

export async function fetchContributors(
  octokit: Octokit,
  owner: string,
  repo: string,
  totalCommits: number,
  fallbackDates?: { createdAt: Date; lastCommitAt: Date },
): Promise<Contributor[]> {
  const { data } = await octokit.repos.listContributors({
    owner,
    repo,
    per_page: 30,
  });

  const contributors = await mapWithConcurrency(data, 4, async (contributor) => {
    const author = contributor.login ?? "unknown";
    const commitDetails = await fetchContributorCommitDetails(
      octokit,
      owner,
      repo,
      author,
    );

    return {
      name: commitDetails?.name ?? author,
      email: commitDetails?.email ?? "",
      commits: contributor.contributions,
      percentage:
        totalCommits > 0
          ? roundToTwo((contributor.contributions / totalCommits) * 100)
          : 0,
      firstCommit: commitDetails?.firstCommit ?? fallbackDates?.createdAt ?? new Date(0),
      lastCommit: commitDetails?.lastCommit ?? fallbackDates?.lastCommitAt ?? new Date(0),
    };
  });

  return contributors.sort((left, right) => right.commits - left.commits);
}

export async function fetchCommitActivity(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<CommitActivityResult> {
  let commitActivity:
    | Array<{
        total: number;
        week: number;
      }>
    | null = null;

  try {
    commitActivity = await requestWithRetry(() =>
      octokit.request("GET /repos/{owner}/{repo}/stats/commit_activity", {
        owner,
        repo,
      }),
    );
  } catch {
    try {
      return await fetchCommitActivityFromHistory(octokit, owner, repo);
    } catch {
      return {
        weeklyActivity: buildEmptyWeeklyActivity(),
        monthlyActivity: buildEmptyMonthlyActivity(),
        activityWeeksAvailable: 0,
      };
    }
  }

  const totalFromStats = commitActivity.reduce((sum, week) => sum + week.total, 0);
  if (totalFromStats === 0) {
    try {
      return await fetchCommitActivityFromHistory(octokit, owner, repo);
    } catch {
      return {
        weeklyActivity: buildEmptyWeeklyActivity(),
        monthlyActivity: buildEmptyMonthlyActivity(),
        activityWeeksAvailable: 0,
      };
    }
  }

  const weeklyActivity: WeeklyActivity[] = commitActivity.map((week) => ({
    week: format(new Date(week.week * 1000), "RRRR-II"),
    count: week.total,
  }));

  const monthlyMap = new Map<string, number>();
  const currentMonthStart = startOfMonth(new Date());
  const monthKeys = Array.from({ length: 12 }, (_, index) =>
    format(subMonths(currentMonthStart, 11 - index), "yyyy-MM"),
  );

  for (const week of commitActivity) {
    const monthKey = format(new Date(week.week * 1000), "yyyy-MM");
    if (monthKeys.includes(monthKey)) {
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + week.total);
    }
  }

  const monthlyActivity: MonthlyActivity[] = monthKeys.map((month) => ({
    month,
    count: monthlyMap.get(month) ?? 0,
  }));

  return {
    weeklyActivity,
    monthlyActivity,
    activityWeeksAvailable: weeklyActivity.length,
  };
}

async function searchTotalCount(octokit: Octokit, query: string): Promise<number> {
  const response = await octokit.search.issuesAndPullRequests({
    q: query,
    per_page: 1,
  });

  return response.data.total_count;
}

export async function fetchIssueStats(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<IssueStatsResult> {
  const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const repoQualifier = `repo:${owner}/${repo}`;

  const [openIssues, closedIssues, openPRs, mergedPRs] = await Promise.all([
    searchTotalCount(octokit, `${repoQualifier} is:issue is:open`),
    searchTotalCount(octokit, `${repoQualifier} is:issue is:closed closed:>=${since}`),
    searchTotalCount(octokit, `${repoQualifier} is:pr is:open`),
    searchTotalCount(octokit, `${repoQualifier} is:pr is:merged merged:>=${since}`),
  ]);

  return {
    openIssues,
    closedIssues,
    openPRs,
    mergedPRs,
  };
}

async function fetchRecentDirectoryStats(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RecentlyChangedDirStat[]> {
  try {
    const commits = await octokit.repos.listCommits({
      owner,
      repo,
      since: subDays(new Date(), 30).toISOString(),
      per_page: REMOTE_RECENT_COMMIT_LIMIT,
    });

    const directoryMap = new Map<string, DirectoryAccumulator>();
    await mapWithConcurrency(commits.data.slice(0, REMOTE_RECENT_COMMIT_LIMIT), 3, async (commit) => {
      try {
        const detail = await octokit.repos.getCommit({
          owner,
          repo,
          ref: commit.sha,
        });
        const commitDate = new Date(
          commit.commit.author?.date ??
            commit.commit.committer?.date ??
            new Date().toISOString(),
        );

        for (const file of detail.data.files ?? []) {
          if (!file.filename || shouldIgnoreRelativePath(file.filename)) {
            continue;
          }

          const directoryPath = getDirectoryFromGitPath(file.filename);
          const current = directoryMap.get(directoryPath) ?? {
            files: new Set<string>(),
            lastChangedAt: commitDate,
          };

          current.files.add(file.filename);
          if (commitDate > current.lastChangedAt) {
            current.lastChangedAt = commitDate;
          }

          directoryMap.set(directoryPath, current);
        }
      } catch {
        // Ignore individual commit failures and keep partial remote data.
      }
    });

    return [...directoryMap.entries()]
      .map(([directoryPath, value]) => ({
        path: directoryPath,
        fileCount: value.files.size,
        lastChangedAt: value.lastChangedAt,
      }))
      .sort((left, right) => {
        if (right.lastChangedAt.getTime() !== left.lastChangedAt.getTime()) {
          return right.lastChangedAt.getTime() - left.lastChangedAt.getTime();
        }

        return right.fileCount - left.fileCount;
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

function readCachedRepoData(cacheKey: string): RepoData | null {
  const cached = cache.get(cacheKey);
  if (!cached) {
    return null;
  }

  const expiresAt = new Date(cached.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    cache.delete(cacheKey);
    return null;
  }

  return fromSerializedRepoData(cached.data);
}

function writeCachedRepoData(cacheKey: string, data: RepoData): void {
  cache.set(cacheKey, {
    expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    data: toSerializedRepoData(data),
  });
}

export async function fetch(
  input: string,
  options: FetchGitHubRepositoryOptions = {},
): Promise<RepoData> {
  const { owner, repo } = parseGithubInput(input);
  const cacheKey = getCacheKey(owner, repo);
  const octokit = createOctokit(options.token);

  if (!options.noCache) {
    const cached = readCachedRepoData(cacheKey);
    if (cached) {
      const githubApiRemaining = await fetchRateLimitRemaining(octokit);

      return {
        ...cached,
        signals: {
          readmeExists: cached.signals?.readmeExists ?? false,
          readmeWordCount: cached.signals?.readmeWordCount ?? 0,
          hasContributing: cached.signals?.hasContributing ?? false,
          hasChangelog: cached.signals?.hasChangelog ?? false,
          hasPackageJson: cached.signals?.hasPackageJson ?? false,
          hasLockfile: cached.signals?.hasLockfile ?? false,
          lockfiles: cached.signals?.lockfiles ?? [],
          hasDependabot: cached.signals?.hasDependabot ?? false,
          dependencyCount: cached.signals?.dependencyCount,
          activityWeeksAvailable: cached.signals?.activityWeeksAvailable,
          githubApiRemaining:
            githubApiRemaining ?? cached.signals?.githubApiRemaining,
        },
      };
    }
  }

  const basicInfo = await fetchBasicInfo(octokit, owner, repo);

  const [
    languages,
    treeStats,
    commitActivity,
    issueStats,
    estimatedTotalCommits,
    totalContributors,
    signals,
    githubApiRemaining,
    recentlyChangedDirs,
  ] = await Promise.all([
    fetchLanguages(octokit, owner, repo),
    fetchTreeStats(octokit, owner, repo, basicInfo.defaultBranch),
    fetchCommitActivity(octokit, owner, repo),
    fetchIssueStats(octokit, owner, repo),
    fetchTotalCommitCount(octokit, owner, repo, basicInfo.defaultBranch),
    fetchTotalContributorCount(octokit, owner, repo),
    fetchRepoSignals(octokit, owner, repo),
    fetchRateLimitRemaining(octokit),
    fetchRecentDirectoryStats(octokit, owner, repo),
  ]);

  let contributors = await fetchContributors(
    octokit,
    owner,
    repo,
    estimatedTotalCommits,
    {
      createdAt: basicInfo.createdAt,
      lastCommitAt: basicInfo.lastCommitAt,
    },
  );

  const totalCommits =
    estimatedTotalCommits ||
    contributors.reduce((sum, contributor) => sum + contributor.commits, 0);

  if (estimatedTotalCommits === 0 && totalCommits > 0) {
    contributors = contributors.map((contributor) => ({
      ...contributor,
      percentage: roundToTwo((contributor.commits / totalCommits) * 100),
    }));
  }

  const draft: RepoDataDraft = {
    name: basicInfo.name,
    description: basicInfo.description,
    url: basicInfo.url,
    license: basicInfo.license,
    createdAt: basicInfo.createdAt,
    lastCommitAt: basicInfo.lastCommitAt,
    defaultBranch: basicInfo.defaultBranch,
    isPrivate: basicInfo.isPrivate,
    languages,
    totalCommits,
    totalContributors: totalContributors || contributors.length,
    linesOfCode: 0,
    fileCount: treeStats.fileCount,
    repoSizeMB: basicInfo.repoSizeMB,
    weeklyActivity: commitActivity.weeklyActivity,
    monthlyActivity: commitActivity.monthlyActivity,
    contributors,
    busFactor: calculateBusFactor(contributors),
    topChurnFiles: [],
    recentlyChangedDirs,
    fileTypeCounts: treeStats.fileTypeCounts,
    stars: basicInfo.stars,
    forks: basicInfo.forks,
    openIssues:
      issueStats.openIssues !== undefined
        ? issueStats.openIssues
        : basicInfo.rawOpenIssues,
    closedIssues: issueStats.closedIssues,
    openPRs: issueStats.openPRs,
    mergedPRs: issueStats.mergedPRs,
    analyzedAt: new Date(),
    source: "github",
    signals: {
      ...signals,
      activityWeeksAvailable: commitActivity.activityWeeksAvailable,
      githubApiRemaining,
    },
  };

  const result: RepoData = {
    ...draft,
    health: scoreRepositoryHealth(draft),
  };

  writeCachedRepoData(cacheKey, result);
  return result;
}

export const fetchGitHubRepository = fetch;
