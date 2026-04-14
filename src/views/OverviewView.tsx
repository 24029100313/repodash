import React from "react";
import { Box, Text, useStdout } from "ink";
import { formatDistanceToNowStrict } from "date-fns";

import { BarChart } from "../components/BarChart.js";
import { ScoreGauge } from "../components/ScoreGauge.js";
import type { RepoData } from "../data/types.js";

export interface OverviewViewProps {
  repo: RepoData;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function buildLanguagePercentages(
  languages: Record<string, number>,
): Array<{ label: string; value: number; color?: string }> {
  const totalBytes = Object.values(languages).reduce((sum, value) => sum + value, 0);
  if (totalBytes === 0) {
    return [];
  }

  return Object.entries(languages)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6)
    .map(([label, value]) => ({
      label,
      value: (value / totalBytes) * 100,
      color: "green",
    }));
}

export function OverviewView({ repo }: OverviewViewProps): React.JSX.Element {
  const { stdout } = useStdout();
  const isWide = (stdout.columns ?? 80) >= 100;
  const languageData = buildLanguagePercentages(repo.languages);

  return (
    <Box flexDirection={isWide ? "row" : "column"}>
      <Box flexDirection="column" width={isWide ? "55%" : undefined} marginRight={isWide ? 3 : 0}>
        <Text bold color="cyan">
          📦 {repo.name}
        </Text>
        <Text>📝 {repo.description ? truncate(repo.description, 60) : "No description"}</Text>
        <Text>🔗 {repo.url || "No origin URL"}</Text>
        <Text>🔒 {repo.license ?? "Unknown"}</Text>
        <Text>
          📅 Created {formatDistanceToNowStrict(repo.createdAt, { addSuffix: true })} / Last
          commit {formatDistanceToNowStrict(repo.lastCommitAt, { addSuffix: true })}
        </Text>
        <Text>👥 Contributors: {repo.totalContributors}</Text>
        <Text>📊 Total commits: {repo.totalCommits}</Text>
        <Text>
          📁 Files: {repo.fileCount} / {repo.repoSizeMB.toFixed(2)} MB
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        <BarChart
          data={languageData}
          title="Top Languages"
          showPercent
          maxWidth={28}
        />
        <Box marginTop={1}>
          <ScoreGauge score={repo.health.total} label="Health Score" size="md" />
        </Box>
        {repo.source === "github" ? (
          <Box marginTop={1} flexDirection="column">
            <Text>⭐ Stars: {repo.stars ?? 0}</Text>
            <Text>🍴 Forks: {repo.forks ?? 0}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
