import path from "node:path";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  type DOMElement,
  measureElement,
  Text,
  useApp,
  useInput,
  useStdin,
  useStdout,
} from "ink";

import { LoadingSpinner } from "./components/LoadingSpinner.js";
import { StatusBar } from "./components/StatusBar.js";
import { TabBar } from "./components/TabBar.js";
import { loadRepoData } from "./data/load-repo.js";
import {
  APP_TABS,
  type AnalysisSource,
  type LoadState,
  type RepoData,
} from "./data/types.js";
import { exportMarkdown } from "./export.js";
import { ActivityView } from "./views/ActivityView.js";
import { ContributorsView } from "./views/ContributorsView.js";
import { FilesView } from "./views/FilesView.js";
import { HealthView } from "./views/HealthView.js";
import { OverviewView } from "./views/OverviewView.js";

const APP_VERSION = "0.1.0";

export interface AppProps {
  source: AnalysisSource;
  noCache?: boolean;
  token?: string;
}

interface ExportNotice {
  color: string;
  message: string;
}

interface ScrollablePaneProps {
  children: React.ReactNode;
  height: number;
  scrollOffset: number;
  onContentHeightChange: (height: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function ScrollablePane({
  children,
  height,
  scrollOffset,
  onContentHeightChange,
}: ScrollablePaneProps): React.JSX.Element {
  const contentRef = useRef<DOMElement | null>(null);

  useEffect(() => {
    if (!contentRef.current) {
      onContentHeightChange(0);
      return;
    }

    onContentHeightChange(measureElement(contentRef.current).height);
  }, [children, height, onContentHeightChange, scrollOffset]);

  return (
    <Box height={height} overflow="hidden" flexDirection="column">
      <Box ref={contentRef} flexDirection="column" marginTop={-scrollOffset}>
        {children}
      </Box>
    </Box>
  );
}

export function App({
  source,
  noCache = false,
  token,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { stdout } = useStdout();
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [repo, setRepo] = useState<RepoData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);

  const viewportHeight = Math.max((stdout.rows ?? 24) - 11, 8);
  const maxScroll = Math.max(contentHeight - viewportHeight, 0);
  const activeTab = APP_TABS[activeIndex]?.id ?? "overview";

  useEffect(() => {
    let cancelled = false;
    const effectiveNoCache = noCache || refreshNonce > 0;

    async function load(): Promise<void> {
      try {
        setLoadState("loading");
        setErrorMessage(null);
        setExportNotice(null);

        const repoData = await loadRepoData(source, {
          noCache: effectiveNoCache,
          token,
        });

        if (cancelled) {
          return;
        }

        setRepo(repoData);
        setLoadState("ready");
        setScrollOffset(0);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unknown loading error",
        );
        setLoadState("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [noCache, refreshNonce, source, token]);

  useEffect(() => {
    setScrollOffset((current) => clamp(current, 0, maxScroll));
  }, [maxScroll]);

  useEffect(() => {
    if (!exportNotice) {
      return;
    }

    const timer = setTimeout(() => {
      setExportNotice(null);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [exportNotice]);

  const view = useMemo(() => {
    if (!repo) {
      return null;
    }

    switch (activeTab) {
      case "overview":
        return <OverviewView repo={repo} />;
      case "activity":
        return <ActivityView repo={repo} />;
      case "contributors":
        return <ContributorsView repo={repo} />;
      case "files":
        return <FilesView repo={repo} />;
      case "health":
        return <HealthView repo={repo} />;
      default:
        return <OverviewView repo={repo} />;
    }
  }, [activeTab, repo]);

  useInput((input, key) => {
    if (!isRawModeSupported) {
      return;
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (key.tab) {
      setActiveIndex((current) => (current + 1) % APP_TABS.length);
      setScrollOffset(0);
      return;
    }

    const digit = Number.parseInt(input, 10);
    if (!Number.isNaN(digit) && digit >= 1 && digit <= APP_TABS.length) {
      setActiveIndex(digit - 1);
      setScrollOffset(0);
      return;
    }

    if (input === "j" || key.downArrow) {
      setScrollOffset((current) => clamp(current + 1, 0, maxScroll));
      return;
    }

    if (input === "k" || key.upArrow) {
      setScrollOffset((current) => clamp(current - 1, 0, maxScroll));
      return;
    }

    if (input === "r") {
      setRefreshNonce((current) => current + 1);
      setScrollOffset(0);
      return;
    }

    if (input === "e" && repo) {
      const reportPath = path.resolve(process.cwd(), "repodash-report.md");
      void exportMarkdown(repo, reportPath)
        .then(() => {
          setExportNotice({
            color: "green",
            message: `Report exported to ${reportPath}`,
          });
        })
        .catch((error) => {
          setExportNotice({
            color: "red",
            message:
              error instanceof Error ? error.message : "Failed to export report",
          });
        });
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        justifyContent="space-between"
        paddingX={1}
      >
        <Text color="cyan">
          repodash v{APP_VERSION} | {repo?.name ?? source.displayName}
        </Text>
        <Text color="gray">{source.displayName}</Text>
      </Box>

      <Box marginTop={1}>
        <TabBar
          tabs={APP_TABS.map((tab) => tab.label)}
          activeIndex={activeIndex}
        />
      </Box>

      {exportNotice ? (
        <Box marginTop={1}>
          <Text color={exportNotice.color}>{exportNotice.message}</Text>
        </Box>
      ) : null}

      <Box
        borderStyle="round"
        borderColor="gray"
        flexDirection="column"
        marginTop={1}
        padding={1}
      >
        {(loadState === "loading" || loadState === "idle") && (
          <LoadingSpinner
            message={
              source.mode === "github"
                ? "Fetching GitHub data..."
                : "Analyzing local repository..."
            }
          />
        )}

        {loadState === "error" ? (
          <Text color="red">Failed to load repository data: {errorMessage}</Text>
        ) : null}

        {loadState === "ready" && view ? (
          <ScrollablePane
            height={viewportHeight}
            scrollOffset={scrollOffset}
            onContentHeightChange={setContentHeight}
          >
            {view}
          </ScrollablePane>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <StatusBar
          sourceMode={source.mode}
          interactive={isRawModeSupported}
          githubApiRemaining={repo?.signals?.githubApiRemaining}
        />
      </Box>
    </Box>
  );
}
