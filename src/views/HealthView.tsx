import React from "react";
import { Box, Text } from "ink";

import { ScoreGauge } from "../components/ScoreGauge.js";
import type { HealthInsight, RepoData } from "../data/types.js";

const FULL_BLOCK = String.fromCodePoint(0x2588);
const MEDIUM_SHADE = String.fromCodePoint(0x2592);

export interface HealthViewProps {
  repo: RepoData;
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

function getLevelIcon(level: HealthInsight["level"]): {
  icon: string;
  color: string;
} {
  if (level === "critical") {
    return { icon: "x", color: "red" };
  }

  if (level === "warning") {
    return { icon: "!", color: "yellow" };
  }

  return { icon: "+", color: "green" };
}

function buildScoreBar(score: number, width: number): string {
  const bounded = Math.max(0, Math.min(score, 100));
  const filledExact = (bounded / 100) * width;
  const filled = Math.floor(filledExact);
  const hasPartial = filled < width && filledExact - filled >= 0.35;

  return `${FULL_BLOCK.repeat(filled)}${hasPartial ? MEDIUM_SHADE : ""}${" ".repeat(
    Math.max(width - filled - (hasPartial ? 1 : 0), 0),
  )}`;
}

function getDimensionColor(score: number): string {
  if (score >= 80) {
    return "green";
  }

  if (score >= 60) {
    return "yellow";
  }

  if (score >= 40) {
    return "#ff9f1c";
  }

  return "red";
}

export function HealthView({ repo }: HealthViewProps): React.JSX.Element {
  const dimensions = [
    { icon: "A", label: "Activity", value: repo.health.activity },
    { icon: "C", label: "Community", value: repo.health.community },
    { icon: "D", label: "Documentation", value: repo.health.documentation },
    { icon: "M", label: "Maintenance", value: repo.health.maintenance },
    { icon: "S", label: "Security", value: repo.health.security },
  ];

  const insights = [...repo.health.insights].sort(
    (left, right) => insightRank(left.level) - insightRank(right.level),
  );

  return (
    <Box flexDirection="column">
      <ScoreGauge score={repo.health.total} size="md" />

      <Box marginTop={1} flexDirection="column">
        {dimensions.map((dimension) => (
          <Text key={dimension.label} color={getDimensionColor(dimension.value)}>
            {dimension.icon} {dimension.label.padEnd(13, " ")} {buildScoreBar(dimension.value, 10)}{" "}
            {Math.round(dimension.value)}/100
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Health Insights</Text>
        {insights.map((insight, index) => {
          const style = getLevelIcon(insight.level);

          return (
            <Box key={`${insight.category}-${index}`} flexDirection="column" marginBottom={1}>
              <Text color={style.color}>
                {style.icon} {insight.level}  {insight.message}
              </Text>
              {insight.suggestion ? (
                <Text color="gray">   Suggestion: {insight.suggestion}</Text>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
