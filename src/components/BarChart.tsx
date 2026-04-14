import React from "react";
import { Box, Text } from "ink";

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarChartDatum[];
  maxWidth?: number;
  showPercent?: boolean;
  title?: string;
}

function formatValue(value: number, showPercent: boolean): string {
  if (showPercent) {
    return `${value.toFixed(1)}%`;
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(1);
}

function renderBar(value: number, maxValue: number, maxWidth: number): string {
  if (maxValue <= 0) {
    return "".padEnd(maxWidth, " ");
  }

  const filled = Math.round((value / maxValue) * maxWidth);
  return `${"█".repeat(filled)}${" ".repeat(Math.max(maxWidth - filled, 0))}`;
}

export function BarChart({
  data,
  maxWidth = 30,
  showPercent = false,
  title,
}: BarChartProps): React.JSX.Element {
  const maxValue = data.reduce(
    (largest, item) => Math.max(largest, item.value),
    0,
  );
  const labelWidth = data.reduce(
    (largest, item) => Math.max(largest, item.label.length),
    0,
  );

  return (
    <Box flexDirection="column">
      {title ? <Text color="cyan">{title}</Text> : null}
      {data.length === 0 ? <Text color="gray">No data</Text> : null}
      {data.map((item) => (
        <Box key={`${item.label}-${item.value}`}>
          <Text>{item.label.padStart(labelWidth, " ")}  </Text>
          <Text color={item.color ?? "green"}>
            {renderBar(item.value, maxValue, maxWidth)}
          </Text>
          <Text>  {formatValue(item.value, showPercent)}</Text>
        </Box>
      ))}
    </Box>
  );
}
