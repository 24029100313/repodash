import React from "react";
import { Box, Text } from "ink";

export interface ScoreGaugeProps {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

function getScoreColor(score: number): string {
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

function buildGaugeBar(score: number, width: number): string {
  const bounded = Math.max(0, Math.min(score, 100));
  const filledExact = (bounded / 100) * width;
  const filled = Math.floor(filledExact);
  const hasPartial = filled < width && filledExact - filled >= 0.35;

  return `${"█".repeat(filled)}${hasPartial ? "▒" : ""}${" ".repeat(
    Math.max(width - filled - (hasPartial ? 1 : 0), 0),
  )}`;
}

function centerText(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }

  const leftPadding = Math.floor((width - value.length) / 2);
  const rightPadding = width - value.length - leftPadding;
  return `${" ".repeat(leftPadding)}${value}${" ".repeat(rightPadding)}`;
}

export function ScoreGauge({
  score,
  label = "Health Score",
  size = "md",
}: ScoreGaugeProps): React.JSX.Element {
  const color = getScoreColor(score);
  const innerWidth = size === "sm" ? 6 : 8;
  const scoreText = centerText(`${Math.round(score)}/100`, innerWidth);
  const gaugeBar = buildGaugeBar(score, innerWidth);
  const topBorder = `╔${"═".repeat(innerWidth)}╗`;
  const middleScore = `║${scoreText}║`;
  const middleGauge = `║${gaugeBar}║`;
  const bottomBorder = `╚${"═".repeat(innerWidth)}╝`;

  return (
    <Box flexDirection="column">
      <Text color={color}>{label}</Text>
      <Text color={color}>{topBorder}</Text>
      <Text color={color}>{middleScore}</Text>
      <Text color={color}>{middleGauge}</Text>
      <Text color={color}>{bottomBorder}</Text>
    </Box>
  );
}
