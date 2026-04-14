import React from "react";
import { Box, Text } from "ink";

import type { SourceMode } from "../data/types.js";

export interface StatusBarProps {
  sourceMode: SourceMode;
  interactive: boolean;
  githubApiRemaining?: number;
}

export function StatusBar({
  sourceMode,
  interactive,
  githubApiRemaining,
}: StatusBarProps): React.JSX.Element {
  const helpText =
    "Tab/1-5: 切换视图  j/k: 滚动  e: 导出报告  r: 刷新  q: 退出";

  const rightParts: string[] = [];
  if (sourceMode === "github" && githubApiRemaining !== undefined) {
    rightParts.push(`API: ${githubApiRemaining} left`);
  }

  if (!interactive) {
    rightParts.push("Preview mode");
  }

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      justifyContent="space-between"
      paddingX={1}
    >
      <Text color="gray">{helpText}</Text>
      <Text color="gray">{rightParts.join("  ")}</Text>
    </Box>
  );
}
