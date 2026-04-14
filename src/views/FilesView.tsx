import React from "react";
import { Box, Text } from "ink";

import { BarChart } from "../components/BarChart.js";
import type { RepoData } from "../data/types.js";

export interface FilesViewProps {
  repo: RepoData;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const keep = Math.max(4, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function FilesView({ repo }: FilesViewProps): React.JSX.Element {
  const churnFiles = repo.topChurnFiles.slice(0, 10);
  const churnChartData = churnFiles.map((file) => ({
    label: truncateMiddle(file.path, 24),
    value: file.changes,
    color: "red",
  }));
  const fileTypeChartData = Object.entries(repo.fileTypeCounts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([fileType, count]) => ({
      label: fileType,
      value: count,
      color: "cyan",
    }));

  return (
    <Box flexDirection="column">
      <Text color="cyan">🔥 Most Changed Files</Text>
      <BarChart data={churnChartData} maxWidth={28} />
      {churnFiles.length > 0 ? (
        churnFiles.map((file) => (
          <Text key={file.path}>
            {truncateMiddle(file.path, 56)}  |  {file.changes} changes  |  +{file.additions}/-
            {file.deletions}
          </Text>
        ))
      ) : (
        <Text color="gray">
          {repo.source === "github"
            ? "Remote file churn details are not computed yet."
            : "No churn data was detected for this repository."}
        </Text>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">📂 Recently Active Directories</Text>
        {repo.source === "github" ? (
          <Text color="yellow">
            partial remote data: directory activity is inferred from recent commit details
          </Text>
        ) : null}
        {repo.recentlyChangedDirs.length > 0 ? (
          repo.recentlyChangedDirs.map((directory) => (
            <Text key={directory.path}>
              {truncateMiddle(directory.path, 40)}  |  {directory.fileCount || 0} files  |  last
              changed {directory.lastChangedAt.toISOString().slice(0, 10)}
            </Text>
          ))
        ) : (
          <Text color="gray">No recent directory activity available.</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">📋 File Types</Text>
        <BarChart data={fileTypeChartData} maxWidth={28} />
      </Box>
    </Box>
  );
}
