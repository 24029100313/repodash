import React from "react";
import { Box, Text } from "ink";

export interface TabBarProps {
  tabs: string[];
  activeIndex: number;
}

export function TabBar({ tabs, activeIndex }: TabBarProps): React.JSX.Element {
  return (
    <Box gap={2}>
      {tabs.map((tab, index) => {
        const active = index === activeIndex;
        const label = active ? `[${index + 1} ${tab}]` : `${index + 1} ${tab}`;

        return (
          <Text key={`${tab}-${index}`} color={active ? "cyan" : "gray"} underline={active}>
            {label}
          </Text>
        );
      })}
    </Box>
  );
}
