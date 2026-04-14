import React from "react";
import { Box, Text } from "ink";

const BOX_TOP_LEFT = String.fromCodePoint(0x2554);
const BOX_TOP_RIGHT = String.fromCodePoint(0x2557);
const BOX_BOTTOM_LEFT = String.fromCodePoint(0x255a);
const BOX_BOTTOM_RIGHT = String.fromCodePoint(0x255d);
const BOX_HORIZONTAL = String.fromCodePoint(0x2550);
const BOX_VERTICAL = String.fromCodePoint(0x2551);
const FULL_BLOCK = String.fromCodePoint(0x2588);
const MEDIUM_SHADE = String.fromCodePoint(0x2592);

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

  return `${FULL_BLOCK.repeat(filled)}${hasPartial ? MEDIUM_SHADE : ""}${" ".repeat(
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
  const topBorder = `${BOX_TOP_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_TOP_RIGHT}`;
  const middleScore = `${BOX_VERTICAL}${scoreText}${BOX_VERTICAL}`;
  const middleGauge = `${BOX_VERTICAL}${gaugeBar}${BOX_VERTICAL}`;
  const bottomBorder = `${BOX_BOTTOM_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_BOTTOM_RIGHT}`;

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
