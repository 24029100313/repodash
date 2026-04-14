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
    "Tab/1-5: switch views  j/k: scroll  e: export report  r: refresh  q: quit";

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
