import React from "react";
import { Box, Text } from "ink";
import { format, parse } from "date-fns";

import type { WeeklyActivity } from "../data/types.js";

export interface HeatmapProps {
  data: WeeklyActivity[];
  title?: string;
}

function parseWeekLabel(week: string): Date | null {
  const parsed = parse(`${week}-1`, "RRRR-II-i", new Date());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMonthLabelLine(data: WeeklyActivity[]): string {
  const lineLength = Math.max(data.length * 2 - 1, 0);
  const characters = Array.from({ length: lineLength }, () => " ");
  let lastMonth = "";

  data.forEach((entry, index) => {
    const parsed = parseWeekLabel(entry.week);
    if (!parsed) {
      return;
    }

    const month = format(parsed, "MMM");
    if (month === lastMonth) {
      return;
    }

    lastMonth = month;
    const startIndex = index * 2;
    for (let charIndex = 0; charIndex < month.length; charIndex += 1) {
      const targetIndex = startIndex + charIndex;
      if (targetIndex < characters.length) {
        characters[targetIndex] = month[charIndex] ?? " ";
      }
    }
  });

  return characters.join("").trimEnd();
}

function getCellStyle(value: number): {
  glyph: string;
  color: string;
  bold?: boolean;
} {
  if (value <= 0) {
    return { glyph: "·", color: "gray" };
  }

  if (value <= 3) {
    return { glyph: "░", color: "greenBright" };
  }

  if (value <= 9) {
    return { glyph: "▒", color: "green" };
  }

  if (value <= 19) {
    return { glyph: "▓", color: "green", bold: true };
  }

  return { glyph: "█", color: "green", bold: true };
}

export function Heatmap({ data, title }: HeatmapProps): React.JSX.Element {
  const visibleData = data.slice(-52);
  const monthLabels = buildMonthLabelLine(visibleData);

  return (
    <Box flexDirection="column">
      {title ? <Text color="cyan">{title}</Text> : null}
      {monthLabels ? <Text color="gray">{monthLabels}</Text> : null}
      <Box>
        {visibleData.map((entry, index) => {
          const style = getCellStyle(entry.count);
          return (
            <Text
              key={`${entry.week}-${index}`}
              color={style.color}
              bold={style.bold}
            >
              {style.glyph}
              {index < visibleData.length - 1 ? " " : ""}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
