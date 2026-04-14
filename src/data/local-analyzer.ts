import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  format,
  startOfISOWeek,
  startOfMonth,
  subMonths,
  subWeeks,
} from "date-fns";
import simpleGit, { type SimpleGit } from "simple-git";

import { scoreRepositoryHealth } from "./health-scorer.js";
import type {
  Contributor,
  FileChurn,
  MonthlyActivity,
  RecentlyChangedDirStat,
  RepoData,
  RepoDataDraft,
  RepoSignals,
  WeeklyActivity,
} from "./types.js";

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

const LOCKFILE_NAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
]);

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".c": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".css": "CSS",
  ".cjs": "JavaScript",
  ".cs": "C#",
  ".go": "Go",
  ".h": "C",
  ".hpp": "C++",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".json": "JSON",
  ".jsx": "JavaScript",
  ".kt": "Kotlin",
  ".lua": "Lua",
  ".m": "Objective-C",
  ".md": "Markdown",
  ".mts": "TypeScript",
  ".php": "PHP",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".scss": "SCSS",
  ".sh": "Shell",
  ".sql": "SQL",
  ".svg": "SVG",
  ".swift": "Swift",
  ".toml": "TOML",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".vue": "Vue",
  ".xml": "XML",
  ".yaml": "YAML",
  ".yml": "YAML",
};

interface ProjectMetadata {
  name: string;
  description: string;
}

interface BasicInfoResult extends ProjectMetadata {
  url: string;
  license: string | null;
  createdAt: Date;
  lastCommitAt: Date;
  defaultBranch: string;
}

interface LanguageScanResult {
  languages: Record<string, number>;
  linesOfCode: number;
  fileCount: number;
  repoSizeMB: number;
  fileTypeCounts: Record<string, number>;
}

interface CommitStatsResult {
  totalCommits: number;
  contributors: Contributor[];
}

interface FileChurnResult {
  topChurnFiles: FileChurn[];
  recentlyChangedDirs: RecentlyChangedDirStat[];
}

interface DirectoryAccumulator {
  files: Set<string>;
  lastChangedAt: Date;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

function shouldIgnoreRelativePath(relativePath: string): boolean {
  const segments = normalizeRelativePath(relativePath).split("/");
  return segments.some((segment) => IGNORED_DIRECTORIES.has(segment));
}

function isBinaryContent(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function countLines(buffer: Buffer): number {
  if (buffer.length === 0) {
    return 0;
  }

  const text = buffer.toString("utf8");
  if (text.length === 0) {
    return 0;
  }

  return text.split(/\r\n|\r|\n/).length;
}

function getLanguageForFile(filePath: string): string {
  const baseName = path.basename(filePath);

  if (baseName === "Dockerfile") {
    return "Dockerfile";
  }

  if (baseName === "Makefile") {
    return "Makefile";
  }

  const extension = path.extname(baseName).toLowerCase();
  if (EXTENSION_LANGUAGE_MAP[extension]) {
    return EXTENSION_LANGUAGE_MAP[extension];
  }

  if (extension) {
    return `Other (${extension})`;
  }

  return "Other ([no extension])";
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

function takeTopEntries(input: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input)
      .sort(([, left], [, right]) => right - left)
      .slice(0, limit),
  );
}

function parseTomlSectionValue(
  source: string,
  sectionName: string,
  key: string,
): string | null {
  const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `\\[${escapedSection}\\]([\\s\\S]*?)(?=^\\[|$)`,
    "m",
  );
  const sectionMatch = sectionPattern.exec(source);
  if (!sectionMatch) {
    return null;
  }

  const keyPattern = new RegExp(`^${key}\\s*=\\s*["'](.+?)["']\\s*$`, "m");
  const keyMatch = keyPattern.exec(sectionMatch[1]);

  return keyMatch?.[1] ?? null;
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function getRootFileEntries(repoRoot: string): Promise<Map<string, string>> {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const fileEntries = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    fileEntries.set(entry.name.toLowerCase(), entry.name);
  }

  return fileEntries;
}

async function findFirstMatchingRootFile(
  repoRoot: string,
  candidates: string[],
): Promise<{ path: string; content: string | null } | null> {
  const fileEntries = await getRootFileEntries(repoRoot);

  for (const candidate of candidates) {
    const actualName = fileEntries.get(candidate.toLowerCase());
    if (!actualName) {
      continue;
    }

    return {
      path: actualName,
      content: await readIfExists(path.join(repoRoot, actualName)),
    };
  }

  return null;
}

async function readProjectMetadata(repoRoot: string): Promise<ProjectMetadata> {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJsonText = await readIfExists(packageJsonPath);
  if (packageJsonText) {
    try {
      const packageJson = JSON.parse(packageJsonText) as {
        name?: string;
        description?: string;
      };

      return {
        name: packageJson.name?.trim() || path.basename(repoRoot),
        description: packageJson.description?.trim() || "",
      };
    } catch {
      // Fall through to the next manifest.
    }
  }

  const cargoToml = await readIfExists(path.join(repoRoot, "Cargo.toml"));
  if (cargoToml) {
    return {
      name:
        parseTomlSectionValue(cargoToml, "package", "name") ||
        path.basename(repoRoot),
      description: parseTomlSectionValue(cargoToml, "package", "description") || "",
    };
  }

  const pyprojectToml = await readIfExists(path.join(repoRoot, "pyproject.toml"));
  if (pyprojectToml) {
    return {
      name:
        parseTomlSectionValue(pyprojectToml, "project", "name") ||
        parseTomlSectionValue(pyprojectToml, "tool.poetry", "name") ||
        path.basename(repoRoot),
      description:
        parseTomlSectionValue(pyprojectToml, "project", "description") ||
        parseTomlSectionValue(pyprojectToml, "tool.poetry", "description") ||
        "",
    };
  }

  const goMod = await readIfExists(path.join(repoRoot, "go.mod"));
  if (goMod) {
    const moduleMatch = /^module\s+(.+)\s*$/m.exec(goMod);
    const moduleName = moduleMatch?.[1]?.trim();

    return {
      name: moduleName
        ? moduleName.split("/").at(-1) ?? path.basename(repoRoot)
        : path.basename(repoRoot),
      description: "",
    };
  }

  return {
    name: path.basename(repoRoot),
    description: "",
  };
}

function detectLicense(content: string): string | null {
  const lower = content.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["MIT", /mit license/],
    ["Apache-2.0", /apache license[\s\S]*version 2\.0/],
    ["GPL-3.0", /gnu general public license[\s\S]*version 3/],
    ["GPL-2.0", /gnu general public license[\s\S]*version 2/],
    ["LGPL-3.0", /gnu lesser general public license[\s\S]*version 3/],
    ["AGPL-3.0", /gnu affero general public license[\s\S]*version 3/],
    ["MPL-2.0", /mozilla public license[\s\S]*2\.0/],
    ["BSD-3-Clause", /redistribution and use in source and binary forms/],
    ["ISC", /\bisc license\b/],
    ["Unlicense", /this is free and unencumbered software released into the public domain/],
    ["CC0-1.0", /creative commons zero/],
  ];

  for (const [identifier, matcher] of checks) {
    if (matcher.test(lower)) {
      return identifier;
    }
  }

  return null;
}

async function resolveLicense(repoRoot: string): Promise<string | null> {
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];
  const match = await findFirstMatchingRootFile(repoRoot, candidates);
  if (match?.content) {
    return detectLicense(match.content);
  }

  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFirstMatchingFile(
  repoRoot: string,
  candidates: string[],
): Promise<{ path: string; content: string | null } | null> {
  return findFirstMatchingRootFile(repoRoot, candidates);
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

export async function getRepoSignals(repoRoot: string): Promise<RepoSignals> {
  const readmeMatch = await findFirstMatchingFile(repoRoot, [
    "README.md",
    "readme.md",
    "README",
    "readme",
    "README.txt",
    "readme.txt",
    "README.rst",
    "readme.rst",
  ]);
  const contributingMatch = await findFirstMatchingFile(repoRoot, [
    "CONTRIBUTING.md",
    "contributing.md",
    "CONTRIBUTING",
    "contributing",
    "CONTRIBUTING.txt",
    "contributing.txt",
  ]);
  const changelogMatch = await findFirstMatchingFile(repoRoot, [
    "CHANGELOG.md",
    "changelog.md",
    "CHANGELOG",
    "changelog",
    "CHANGELOG.txt",
    "changelog.txt",
    "HISTORY.md",
    "history.md",
  ]);
  const packageJsonText = await readIfExists(path.join(repoRoot, "package.json"));
  const lockfileCandidates = [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
  ];
  const lockfiles = (
    await Promise.all(
      lockfileCandidates.map(async (lockfile) =>
        (await fileExists(path.join(repoRoot, lockfile))) ? lockfile : null,
      ),
    )
  ).filter((lockfile): lockfile is string => lockfile !== null);
  const hasDependabot =
    (await fileExists(path.join(repoRoot, ".github", "dependabot.yml"))) ||
    (await fileExists(path.join(repoRoot, ".github", "dependabot.yaml")));

  return {
    readmeExists: readmeMatch !== null,
    readmeWordCount: readmeMatch?.content ? countWords(readmeMatch.content) : 0,
    hasContributing: contributingMatch !== null,
    hasChangelog: changelogMatch !== null,
    hasPackageJson: packageJsonText !== null,
    hasLockfile: lockfiles.length > 0,
    lockfiles,
    hasDependabot,
    dependencyCount: packageJsonText
      ? countPackageDependencies(packageJsonText)
      : undefined,
  };
}

function shouldExcludeFromLanguageStats(filePath: string): boolean {
  const baseName = path.basename(filePath).toLowerCase();
  return LOCKFILE_NAMES.has(baseName);
}

async function getDefaultBranch(git: SimpleGit): Promise<string> {
  try {
    const symbolicRef = (
      await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"])
    ).trim();
    const parts = symbolicRef.split("/");
    return parts.at(-1) || "HEAD";
  } catch {
    try {
      return (await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "HEAD";
    } catch {
      return "HEAD";
    }
  }
}

async function getRemoteUrl(git: SimpleGit): Promise<string> {
  try {
    return (await git.raw(["remote", "get-url", "origin"])).trim();
  } catch {
    return "";
  }
}

async function getAllCommitDates(git: SimpleGit): Promise<Date[]> {
  const output = await git.raw(["log", "--all", "--format=%aI"]);

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => new Date(line))
    .filter((value) => !Number.isNaN(value.getTime()));
}

async function getCommitDateRange(
  git: SimpleGit,
): Promise<{ createdAt: Date | null; lastCommitAt: Date | null }> {
  try {
    const commitDates = await getAllCommitDates(git);

    if (commitDates.length === 0) {
      return {
        createdAt: null,
        lastCommitAt: null,
      };
    }

    let createdAt = commitDates[0] ?? null;
    let lastCommitAt = commitDates[0] ?? null;

    for (const commitDate of commitDates) {
      if (createdAt && commitDate < createdAt) {
        createdAt = commitDate;
      }

      if (lastCommitAt && commitDate > lastCommitAt) {
        lastCommitAt = commitDate;
      }
    }

    return {
      createdAt,
      lastCommitAt,
    };
  } catch {
    return {
      createdAt: null,
      lastCommitAt: null,
    };
  }
}

function getDirectoryFromGitPath(gitPath: string): string {
  const normalized = normalizeRelativePath(gitPath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ".";
}

function calculateActivityWeeksAvailable(createdAt: Date, totalCommits: number): number {
  if (totalCommits === 0 || Number.isNaN(createdAt.getTime())) {
    return 0;
  }

  const currentWeekStart = startOfISOWeek(new Date());
  const oldestVisibleWeek = startOfISOWeek(subWeeks(currentWeekStart, 51));
  const firstWeek = startOfISOWeek(
    createdAt > oldestVisibleWeek ? createdAt : oldestVisibleWeek,
  );
  const diffWeeks = Math.floor(
    (currentWeekStart.getTime() - firstWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  return Math.max(0, Math.min(52, diffWeeks + 1));
}

async function getRecentDirectoryActivity(
  git: SimpleGit,
): Promise<RecentlyChangedDirStat[]> {
  try {
    const output = await git.raw([
      "log",
      "--since=30.days",
      "--name-only",
      "--format=%aI",
      "--all",
    ]);

    const directoryMap = new Map<string, DirectoryAccumulator>();
    let currentDate: Date | null = null;

    for (const line of output.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmedLine)) {
        const parsedDate = new Date(trimmedLine);
        currentDate = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
        continue;
      }

      if (!currentDate) {
        continue;
      }

      const filePath = normalizeRelativePath(trimmedLine);
      if (!filePath || shouldIgnoreRelativePath(filePath)) {
        continue;
      }

      const directory = getDirectoryFromGitPath(filePath);
      const current = directoryMap.get(directory) ?? {
        files: new Set<string>(),
        lastChangedAt: currentDate,
      };

      current.files.add(filePath);
      if (currentDate > current.lastChangedAt) {
        current.lastChangedAt = currentDate;
      }

      directoryMap.set(directory, current);
    }

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

async function isShallowRepository(git: SimpleGit): Promise<boolean> {
  try {
    return (await git.raw(["rev-parse", "--is-shallow-repository"])).trim() === "true";
  } catch {
    return false;
  }
}

export async function validateRepo(repoPath: string): Promise<string> {
  const resolvedPath = path.resolve(repoPath);
  await access(resolvedPath, fsConstants.F_OK);

  const targetStat = await stat(resolvedPath);
  const gitBasePath = targetStat.isDirectory()
    ? resolvedPath
    : path.dirname(resolvedPath);
  const git = simpleGit(gitBasePath);

  try {
    const repoRoot = (await git.raw(["rev-parse", "--show-toplevel"])).trim();
    if (!repoRoot) {
      throw new Error();
    }

    return repoRoot;
  } catch {
    throw new Error(`Path is not a Git repository: ${resolvedPath}`);
  }
}

export async function getBasicInfo(
  git: SimpleGit,
  repoRoot: string,
): Promise<BasicInfoResult> {
  const [metadata, license, repoStat, commitDateRange, defaultBranch, url] =
    await Promise.all([
      readProjectMetadata(repoRoot),
      resolveLicense(repoRoot),
      stat(repoRoot),
      getCommitDateRange(git),
      getDefaultBranch(git),
      getRemoteUrl(git),
    ]);

  return {
    ...metadata,
    url,
    license,
    createdAt: commitDateRange.createdAt ?? repoStat.birthtime,
    lastCommitAt: commitDateRange.lastCommitAt ?? repoStat.mtime,
    defaultBranch,
  };
}

export async function getLanguages(repoRoot: string): Promise<LanguageScanResult> {
  const languageBytes: Record<string, number> = {};
  const fileTypeCounts: Record<string, number> = {};
  let linesOfCode = 0;
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath));

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || shouldIgnoreRelativePath(relativePath)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || shouldIgnoreRelativePath(relativePath)) {
        continue;
      }

      try {
        const fileStat = await stat(absolutePath);
        const fileSize = fileStat.size;
        const fileType = getFileTypeForFile(relativePath);
        const excludeFromLanguageStats = shouldExcludeFromLanguageStats(relativePath);

        fileCount += 1;
        totalBytes += fileSize;
        fileTypeCounts[fileType] = (fileTypeCounts[fileType] ?? 0) + 1;

        if (!excludeFromLanguageStats) {
          const content = await readFile(absolutePath);
          if (isBinaryContent(content)) {
            continue;
          }

          const language = getLanguageForFile(relativePath);
          languageBytes[language] = (languageBytes[language] ?? 0) + fileSize;
          linesOfCode += countLines(content);
        }
      } catch {
        continue;
      }
    }
  }

  await walk(repoRoot);

  return {
    languages: takeTopEntries(languageBytes, 10),
    linesOfCode,
    fileCount,
    repoSizeMB: roundToTwo(totalBytes / (1024 * 1024)),
    fileTypeCounts,
  };
}

export async function getCommitStats(git: SimpleGit): Promise<CommitStatsResult> {
  const [totalCommitOutput, shortlogOutput, authorHistoryOutput] = await Promise.all([
    git.raw(["rev-list", "--count", "--all"]),
    git.raw(["shortlog", "-sne", "--all"]),
    git.raw(["log", "--all", "--format=%aN%x09%aE%x09%aI"]),
  ]);

  const totalCommits = Number.parseInt(totalCommitOutput.trim(), 10) || 0;
  const contributorDates = new Map<
    string,
    { name: string; email: string; firstCommit: Date; lastCommit: Date }
  >();

  for (const line of authorHistoryOutput.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [name = "", email = "", isoDate = ""] = line.split("\t");
    const parsedDate = new Date(isoDate);
    if (Number.isNaN(parsedDate.getTime())) {
      continue;
    }

    const key = (email || name).trim().toLowerCase();
    const existing = contributorDates.get(key);
    if (!existing) {
      contributorDates.set(key, {
        name: name.trim(),
        email: email.trim(),
        firstCommit: parsedDate,
        lastCommit: parsedDate,
      });
      continue;
    }

    if (parsedDate < existing.firstCommit) {
      existing.firstCommit = parsedDate;
    }

    if (parsedDate > existing.lastCommit) {
      existing.lastCommit = parsedDate;
    }
  }

  const contributors: Contributor[] = shortlogOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(.+?)\s+<([^>]+)>$/.exec(line);
      if (!match) {
        return null;
      }

      const commits = Number.parseInt(match[1], 10);
      const name = match[2].trim();
      const email = match[3].trim();
      const key = (email || name).toLowerCase();
      const dates = contributorDates.get(key);
      const fallbackDate = new Date(0);

      return {
        name,
        email,
        commits,
        percentage:
          totalCommits > 0 ? roundToTwo((commits / totalCommits) * 100) : 0,
        firstCommit: dates?.firstCommit ?? fallbackDate,
        lastCommit: dates?.lastCommit ?? fallbackDate,
      };
    })
    .filter((contributor): contributor is Contributor => contributor !== null)
    .sort((left, right) => right.commits - left.commits);

  return {
    totalCommits,
    contributors,
  };
}

export async function getWeeklyActivity(git: SimpleGit): Promise<WeeklyActivity[]> {
  const commitDates = await getAllCommitDates(git);
  const counts = new Map<string, number>();

  for (const commitDate of commitDates) {
    const key = format(commitDate, "RRRR-II");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const currentWeekStart = startOfISOWeek(new Date());

  return Array.from({ length: 52 }, (_, index) => {
    const weekStart = subWeeks(currentWeekStart, 51 - index);
    const week = format(weekStart, "RRRR-II");
    return {
      week,
      count: counts.get(week) ?? 0,
    };
  });
}

export async function getMonthlyActivity(git: SimpleGit): Promise<MonthlyActivity[]> {
  const commitDates = await getAllCommitDates(git);
  const counts = new Map<string, number>();

  for (const commitDate of commitDates) {
    const key = format(commitDate, "yyyy-MM");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const currentMonthStart = startOfMonth(new Date());

  return Array.from({ length: 12 }, (_, index) => {
    const monthStart = subMonths(currentMonthStart, 11 - index);
    const month = format(monthStart, "yyyy-MM");
    return {
      month,
      count: counts.get(month) ?? 0,
    };
  });
}

function normalizeChurnPath(rawPath: string): string {
  return normalizeRelativePath(rawPath.trim());
}

export async function getFileChurn(git: SimpleGit): Promise<FileChurnResult> {
  const [output, recentlyChangedDirs] = await Promise.all([
    git.raw([
      "log",
      "--numstat",
      "--find-renames",
      "--format=",
      "--all",
    ]),
    getRecentDirectoryActivity(git),
  ]);

  const churnByFile = new Map<string, FileChurn>();

  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
    const filePath = normalizeChurnPath(parts.at(-1) ?? "");

    if (!filePath || shouldIgnoreRelativePath(filePath)) {
      continue;
    }

    const current = churnByFile.get(filePath) ?? {
      path: filePath,
      changes: 0,
      additions: 0,
      deletions: 0,
    };

    current.changes += 1;
    current.additions += additions;
    current.deletions += deletions;

    churnByFile.set(filePath, current);
  }

  const topChurnFiles = [...churnByFile.values()]
    .sort((left, right) => {
      if (right.changes !== left.changes) {
        return right.changes - left.changes;
      }

      return right.additions + right.deletions - (left.additions + left.deletions);
    })
    .slice(0, 15);

  return {
    topChurnFiles,
    recentlyChangedDirs,
  };
}

export function calculateBusFactor(contributors: Contributor[]): number {
  const totalCommits = contributors.reduce(
    (sum, contributor) => sum + contributor.commits,
    0,
  );

  if (totalCommits === 0) {
    return 0;
  }

  let accumulated = 0;
  for (let index = 0; index < contributors.length; index += 1) {
    accumulated += contributors[index]?.commits ?? 0;
    if (accumulated > totalCommits / 2) {
      return index + 1;
    }
  }

  return contributors.length;
}

export async function analyze(repoPath: string): Promise<RepoData> {
  const repoRoot = await validateRepo(repoPath);
  const git = simpleGit(repoRoot);

  const [languageScan, baseSignals, isShallowClone] = await Promise.all([
    getLanguages(repoRoot),
    getRepoSignals(repoRoot),
    isShallowRepository(git),
  ]);

  const basicInfo = await getBasicInfo(git, repoRoot);
  const commitStats = await getCommitStats(git);
  const weeklyActivity = await getWeeklyActivity(git);
  const monthlyActivity = await getMonthlyActivity(git);
  const fileChurn = await getFileChurn(git);

  const signals: RepoSignals = {
    ...baseSignals,
    activityWeeksAvailable: calculateActivityWeeksAvailable(
      basicInfo.createdAt,
      commitStats.totalCommits,
    ),
    isShallowClone,
  };

  const draft: RepoDataDraft = {
    name: basicInfo.name,
    description: basicInfo.description,
    url: basicInfo.url,
    license: basicInfo.license,
    createdAt: basicInfo.createdAt,
    lastCommitAt: basicInfo.lastCommitAt,
    defaultBranch: basicInfo.defaultBranch,
    isPrivate: false,
    languages: languageScan.languages,
    totalCommits: commitStats.totalCommits,
    totalContributors: commitStats.contributors.length,
    linesOfCode: languageScan.linesOfCode,
    fileCount: languageScan.fileCount,
    repoSizeMB: languageScan.repoSizeMB,
    weeklyActivity,
    monthlyActivity,
    contributors: commitStats.contributors,
    busFactor: calculateBusFactor(commitStats.contributors),
    topChurnFiles: fileChurn.topChurnFiles,
    recentlyChangedDirs: fileChurn.recentlyChangedDirs,
    fileTypeCounts: languageScan.fileTypeCounts,
    analyzedAt: new Date(),
    source: "local",
    signals,
  };

  return {
    ...draft,
    health: scoreRepositoryHealth(draft),
  };
}

export const analyzeLocalRepository = analyze;
