import { writeFile } from "node:fs/promises";
import path from "node:path";

import { formatDistanceToNowStrict } from "date-fns";

import type { HealthInsight, RepoData } from "./data/types.js";

const APP_VERSION = "0.1.0";
const REPOSITORY_URL = "https://github.com/24029100313/repodash";
const REPORT_ICON = String.fromCodePoint(0x1f4ca);
const STATUS_GOOD = String.fromCodePoint(0x2705);
const STATUS_WARNING = String.fromCodePoint(0x26a0, 0xfe0f);
const STATUS_CRITICAL = String.fromCodePoint(0x274c);

function formatRelativeTime(date: Date): string {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function statusEmoji(score: number): string {
  if (score >= 80) {
    return STATUS_GOOD;
  }

  if (score >= 60) {
    return STATUS_WARNING;
  }

  return STATUS_CRITICAL;
}

function insightRank(level: HealthInsight["level"]): number {
  if (level === "critical") {
    return 0;
  }

  if (level === "warning") {
    return 1;
  }

  return 2;
}

function renderTextBar(value: number, total: number, width = 24): string {
  if (total <= 0) {
    return " ".repeat(width);
  }

  const filled = Math.round((value / total) * width);
  return `${"#".repeat(filled)}${" ".repeat(Math.max(width - filled, 0))}`;
}

function renderLanguageDistribution(repo: RepoData): string[] {
  const entries = Object.entries(repo.languages)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const labelWidth = entries.reduce(
    (largest, [label]) => Math.max(largest, label.length),
    0,
  );

  if (entries.length === 0) {
    return ["No language data available."];
  }

  return entries.map(([label, value]) => {
    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
    return `${label.padEnd(labelWidth, " ")}  ${renderTextBar(value, total)}  ${percent}%`;
  });
}

function renderInsights(insights: HealthInsight[]): string[] {
  const sorted = [...insights].sort(
    (left, right) => insightRank(left.level) - insightRank(right.level),
  );

  return sorted.flatMap((insight) => {
    const icon =
      insight.level === "critical"
        ? STATUS_CRITICAL
        : insight.level === "warning"
          ? STATUS_WARNING
          : STATUS_GOOD;

    return [
      `- ${icon} **${insight.category}**: ${insight.message}`,
      insight.suggestion ? `  - Suggestion: ${insight.suggestion}` : null,
    ].filter((line): line is string => line !== null);
  });
}

function renderOverviewTable(repo: RepoData): string[] {
  return [
    "| Metric | Value |",
    "|--------|-------|",
    `| Total Commits | ${repo.totalCommits} |`,
    `| Contributors | ${repo.totalContributors} |`,
    `| Lines of Code | ${repo.linesOfCode} |`,
    `| Last Commit | ${formatRelativeTime(repo.lastCommitAt)} |`,
    `| License | ${repo.license ?? "Unknown"} |`,
    `| Health Score | ${repo.health.total}/100 |`,
  ];
}

function renderHealthTable(repo: RepoData): string[] {
  return [
    "| Dimension | Score | Status |",
    "|-----------|-------|--------|",
    `| Activity | ${repo.health.activity}/100 | ${statusEmoji(repo.health.activity)} |`,
    `| Community | ${repo.health.community}/100 | ${statusEmoji(repo.health.community)} |`,
    `| Documentation | ${repo.health.documentation}/100 | ${statusEmoji(repo.health.documentation)} |`,
    `| Maintenance | ${repo.health.maintenance}/100 | ${statusEmoji(repo.health.maintenance)} |`,
    `| Security | ${repo.health.security}/100 | ${statusEmoji(repo.health.security)} |`,
  ];
}

function renderTopContributors(repo: RepoData): string[] {
  const contributors = repo.contributors.slice(0, 10);

  if (contributors.length === 0) {
    return ["No contributor data available."];
  }

  return [
    "| Contributor | Commits | Share | First Commit | Last Commit |",
    "|-------------|---------|-------|--------------|-------------|",
    ...contributors.map(
      (contributor) =>
        `| ${truncate(contributor.name, 32)} | ${contributor.commits} | ${contributor.percentage.toFixed(1)}% | ${contributor.firstCommit.toISOString().slice(0, 10)} | ${contributor.lastCommit.toISOString().slice(0, 10)} |`,
    ),
  ];
}

function renderMonthlyActivity(repo: RepoData): string[] {
  return [
    "| Month | Commits |",
    "|-------|---------|",
    ...repo.monthlyActivity.map(
      (entry) => `| ${entry.month} | ${entry.count} |`,
    ),
  ];
}

function renderFileChurn(repo: RepoData): string[] {
  const churnFiles = repo.topChurnFiles.slice(0, 10);

  if (churnFiles.length === 0) {
    return ["No file churn data available."];
  }

  return [
    "| File | Changes | Additions | Deletions |",
    "|------|---------|-----------|-----------|",
    ...churnFiles.map(
      (file) =>
        `| ${truncate(file.path, 64)} | ${file.changes} | ${file.additions} | ${file.deletions} |`,
    ),
  ];
}

export function exportJson(data: RepoData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export async function exportMarkdown(
  data: RepoData,
  outputPath: string,
): Promise<void> {
  const generatedAt = new Date();
  const lines = [
    `# ${REPORT_ICON} repodash Report: ${data.name}`,
    "",
    `> Generated by [repodash](${REPOSITORY_URL}) on ${generatedAt.toISOString()}`,
    "",
    "## Overview",
    ...renderOverviewTable(data),
    "",
    `## Health Score: ${data.health.total}/100`,
    "",
    ...renderHealthTable(data),
    "",
    "### Insights",
    ...renderInsights(data.health.insights),
    "",
    "## Language Distribution",
    ...renderLanguageDistribution(data),
    "",
    "## Top Contributors",
    ...renderTopContributors(data),
    "",
    "## Commit Activity (Last 12 Months)",
    ...renderMonthlyActivity(data),
    "",
    "## Most Changed Files",
    ...renderFileChurn(data),
    "",
    "---",
    `*Report generated by repodash v${APP_VERSION}*`,
    "",
  ];

  await writeFile(path.resolve(outputPath), lines.join("\n"), "utf8");
}
