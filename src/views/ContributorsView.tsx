import React from "react";
import { format } from "date-fns";
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

function getBusFactorStatus(repo: RepoData): {
  color: string;
  label: string;
} {
  if (repo.totalContributors === 1) {
    return { color: "yellow", label: "Solo project: expected single-maintainer risk" };
  }

  if (repo.busFactor <= 1) {
    return { color: "red", label: "High risk: single point of failure" };
  }

  if (repo.busFactor === 2) {
    return { color: "yellow", label: "Needs attention" };
  }

  return { color: "green", label: "Healthy" };
}

export function ContributorsView({ repo }: ContributorsViewProps): React.JSX.Element {
  const topContributors = repo.contributors.slice(0, 10);
  const chartData = topContributors.map((contributor) => ({
    label: contributor.name,
    value: contributor.commits,
    color: "green",
  }));
  const busFactorStatus = getBusFactorStatus(repo);
  const gini = calculateGini(repo.contributors.map((contributor) => contributor.commits));

  return (
    <Box flexDirection="column">
      <Text color={busFactorStatus.color}>
        Bus Factor: {repo.busFactor}  |  {busFactorStatus.label}
      </Text>
      <Text color="gray">
        Bus factor is the smallest number of contributors needed to account for half of the
        commit history.
      </Text>

      <Box marginTop={1} flexDirection="column">
        <BarChart data={chartData} maxWidth={28} title="Top 10 Contributors" />
        {topContributors.map((contributor) => (
          <Text key={`${contributor.name}-${contributor.email}`}>
            {contributor.name}: first {format(contributor.firstCommit, "MMM d, yyyy")} / last{" "}
            {format(contributor.lastCommit, "MMM d, yyyy")}
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
