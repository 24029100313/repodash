import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

export interface LoadingSpinnerProps {
  message: string;
}

export function LoadingSpinner({
  message,
}: LoadingSpinnerProps): React.JSX.Element {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">
        {SPINNER_FRAMES[frameIndex]} {message}
      </Text>
    </Box>
  );
}
