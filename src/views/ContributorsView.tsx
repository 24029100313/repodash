import React from "react";
import { Box, Text } from "ink";

import { BarChart } from "../components/BarChart.js";
import type { RepoData } from "../data/types.js";

export interface ContributorsViewProps {
  repo: RepoData;
}

function calculateGini(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }

  let weightedSum = 0;
  sorted.forEach((value, index) => {
    weightedSum += (2 * (index + 1) - sorted.length - 1) * value;
  });

  return Math.max(0, Math.min(1, weightedSum / (sorted.length * total)));
}

function topContributionShare(repo: RepoData, limit: number): string {
  const total = repo.contributors.reduce((sum, contributor) => sum + contributor.commits, 0);
  if (total === 0) {
    return "0.0%";
  }

  const partial = repo.contributors
    .slice(0, limit)
    .reduce((sum, contributor) => sum + contributor.commits, 0);

  return `${((partial / total) * 100).toFixed(1)}%`;
}

function getBusFactorStatus(busFactor: number): {
  color: string;
  label: string;
} {
  if (busFactor <= 1) {
    return { color: "red", label: "⚠ 高风险：单点依赖" };
  }

  if (busFactor === 2) {
    return { color: "yellow", label: "需关注" };
  }

  return { color: "green", label: "健康" };
}

export function ContributorsView({ repo }: ContributorsViewProps): React.JSX.Element {
  const topContributors = repo.contributors.slice(0, 10);
  const chartData = topContributors.map((contributor) => ({
    label: contributor.name,
    value: contributor.commits,
    color: "green",
  }));
  const busFactorStatus = getBusFactorStatus(repo.busFactor);
  const gini = calculateGini(repo.contributors.map((contributor) => contributor.commits));

  return (
    <Box flexDirection="column">
      <Text color={busFactorStatus.color}>
        Bus Factor: {repo.busFactor}  |  {busFactorStatus.label}
      </Text>
      <Text color="gray">
        Bus factor 表示要累积到 50% 提交量，最少需要多少位贡献者。
      </Text>

      <Box marginTop={1} flexDirection="column">
        <BarChart data={chartData} maxWidth={28} title="Top 10 Contributors" />
        {topContributors.map((contributor) => (
          <Text key={`${contributor.name}-${contributor.email}`}>
            {contributor.name}: first {contributor.firstCommit.toISOString().slice(0, 10)} / last{" "}
            {contributor.lastCommit.toISOString().slice(0, 10)}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Contribution Distribution</Text>
        <Text>Gini coefficient: {gini.toFixed(3)}</Text>
        <Text>Top 1 share: {topContributionShare(repo, 1)}</Text>
        <Text>Top 3 share: {topContributionShare(repo, 3)}</Text>
        <Text>Top 5 share: {topContributionShare(repo, 5)}</Text>
      </Box>
    </Box>
  );
}
