export type SourceMode = "local" | "github";

export type AppTab =
  | "overview"
  | "activity"
  | "contributors"
  | "files"
  | "health";

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface LocalAnalysisSource {
  mode: "local";
  input: string;
  repoPath: string;
  displayName: string;
}

export interface GitHubAnalysisSource {
  mode: "github";
  input: string;
  owner: string;
  repo: string;
  displayName: string;
}

export type AnalysisSource = LocalAnalysisSource | GitHubAnalysisSource;

export interface Contributor {
  name: string;
  email: string;
  commits: number;
  percentage: number;
  firstCommit: Date;
  lastCommit: Date;
}

export interface WeeklyActivity {
  week: string;
  count: number;
}

export interface MonthlyActivity {
  month: string;
  count: number;
}

export interface FileChurn {
  path: string;
  changes: number;
  additions: number;
  deletions: number;
}

export interface RecentlyChangedDirStat {
  path: string;
  fileCount: number;
  lastChangedAt: Date;
}

export type HealthCategory =
  | "activity"
  | "community"
  | "documentation"
  | "maintenance"
  | "security";

export interface HealthInsight {
  category: HealthCategory;
  level: "good" | "warning" | "critical";
  message: string;
  suggestion?: string;
}

export interface HealthScore {
  total: number;
  activity: number;
  community: number;
  documentation: number;
  maintenance: number;
  security: number;
  insights: HealthInsight[];
}

export interface RepoSignals {
  readmeExists: boolean;
  readmeWordCount: number;
  hasContributing: boolean;
  hasChangelog: boolean;
  hasPackageJson: boolean;
  hasLockfile: boolean;
  lockfiles: string[];
  hasDependabot: boolean;
  dependencyCount?: number;
  githubApiRemaining?: number;
  activityWeeksAvailable?: number;
}

export interface RepoData {
  name: string;
  description: string;
  url: string;
  license: string | null;
  createdAt: Date;
  lastCommitAt: Date;
  defaultBranch: string;
  isPrivate: boolean;
  languages: Record<string, number>;
  totalCommits: number;
  totalContributors: number;
  linesOfCode: number;
  fileCount: number;
  repoSizeMB: number;
  weeklyActivity: WeeklyActivity[];
  monthlyActivity: MonthlyActivity[];
  contributors: Contributor[];
  busFactor: number;
  topChurnFiles: FileChurn[];
  recentlyChangedDirs: RecentlyChangedDirStat[];
  fileTypeCounts: Record<string, number>;
  stars?: number;
  forks?: number;
  openIssues?: number;
  closedIssues?: number;
  openPRs?: number;
  mergedPRs?: number;
  health: HealthScore;
  analyzedAt: Date;
  source: SourceMode;
  signals?: RepoSignals;
}

export type RepoDataDraft = Omit<RepoData, "health">;

export interface TabDefinition {
  id: AppTab;
  label: string;
}

export const APP_TABS: TabDefinition[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "contributors", label: "Contributors" },
  { id: "files", label: "Files" },
  { id: "health", label: "Health" },
];
