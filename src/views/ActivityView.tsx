import React from "react";
import { Box, Text } from "ink";

import { BarChart } from "../components/BarChart.js";
import { Heatmap } from "../components/Heatmap.js";
import type { RepoData } from "../data/types.js";

export interface ActivityViewProps {
  repo: RepoData;
}

function buildMonthlyBars(repo: RepoData): Array<{ label: string; value: number; color?: string }> {
  return repo.monthlyActivity.map((entry) => ({
    label: entry.month.slice(5),
    value: entry.count,
    color: "cyan",
  }));
}

function describeMonthOverMonthChange(repo: RepoData): string {
  if (repo.monthlyActivity.length < 2) {
    return "No month-over-month comparison yet";
  }

  const current = repo.monthlyActivity.at(-1)?.count ?? 0;
  const previous = repo.monthlyActivity.at(-2)?.count ?? 0;

  if (previous === 0 && current === 0) {
    return "Month-over-month: no change";
  }

  if (previous === 0 && current > 0) {
    return "Month-over-month: new activity";
  }

  const ratio = ((current - previous) / previous) * 100;
  return `Month-over-month: ${ratio >= 0 ? "+" : ""}${ratio.toFixed(1)}%`;
}

export function ActivityView({ repo }: ActivityViewProps): React.JSX.Element {
  const weeklyTotal = repo.weeklyActivity.reduce((sum, entry) => sum + entry.count, 0);
  const peakWeek =
    repo.weeklyActivity.reduce(
      (best, entry) => (entry.count > best.count ? entry : best),
      repo.weeklyActivity[0] ?? { week: "N/A", count: 0 },
    ) ?? { week: "N/A", count: 0 };
  const averagePerWeek =
    repo.weeklyActivity.length > 0 ? weeklyTotal / repo.weeklyActivity.length : 0;
  const monthlyBars = buildMonthlyBars(repo);
  const availableWeeks = repo.signals?.activityWeeksAvailable;

  return (
    <Box flexDirection="column">
      <Text color="cyan">📈 Commit Activity (Last 52 Weeks)</Text>
      <Heatmap data={repo.weeklyActivity} />
      <Text>
        Peak week: {peakWeek.week} ({peakWeek.count})  |  Total commits: {weeklyTotal}  |  Avg/week:{" "}
        {averagePerWeek.toFixed(1)}
      </Text>
      {availableWeeks !== undefined && availableWeeks < 52 ? (
        <Text color="yellow">Only {availableWeeks} weeks of source data available</Text>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">📊 Monthly Commits (Last 12 Months)</Text>
        <BarChart data={monthlyBars} maxWidth={28} />
        <Text color="gray">{describeMonthOverMonthChange(repo)}</Text>
      </Box>
    </Box>
  );
}
