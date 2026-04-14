import { subDays } from "date-fns";

import type {
  HealthCategory,
  HealthInsight,
  HealthScore,
  RepoDataDraft,
  RepoSignals,
} from "./types.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getSignals(data: RepoDataDraft): RepoSignals {
  return {
    readmeExists: false,
    readmeWordCount: 0,
    hasContributing: false,
    hasChangelog: false,
    hasPackageJson: false,
    hasLockfile: false,
    lockfiles: [],
    hasDependabot: false,
    ...data.signals,
  };
}

function sumCounts(entries: Array<{ count: number }>): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

function createInsight(
  category: HealthCategory,
  score: number,
  message: string,
  suggestion: string,
  overrideLevel?: HealthInsight["level"],
): HealthInsight {
  const level =
    overrideLevel ??
    (score >= 80 ? "good" : score >= 50 ? "warning" : "critical");

  return {
    category,
    level,
    message,
    suggestion,
  };
}

function scoreActivity(data: RepoDataDraft): {
  score: number;
  insight: HealthInsight;
} {
  const now = new Date();
  const dayDiff = Math.max(
    0,
    Math.floor((now.getTime() - data.lastCommitAt.getTime()) / 86_400_000),
  );

  let recencyRaw = 0;
  if (dayDiff <= 7) {
    recencyRaw = 40;
  } else if (dayDiff <= 30) {
    recencyRaw = 30;
  } else if (dayDiff <= 90) {
    recencyRaw = 20;
  }

  const recentThreeMonths = sumCounts(data.monthlyActivity.slice(-3));
  const previousThreeMonths = sumCounts(data.monthlyActivity.slice(-6, -3));

  let trendRaw = 0;
  let trendLabel = "down";
  if (recentThreeMonths > previousThreeMonths) {
    trendRaw = 10;
    trendLabel = "up";
  } else if (recentThreeMonths === previousThreeMonths) {
    trendRaw = 5;
    trendLabel = "flat";
  }

  const score = clampScore((recencyRaw + trendRaw) * 2);

  let message = `Commit activity is ${trendLabel} over the last three months.`;
  let suggestion =
    "Keep a steady release or maintenance rhythm so activity does not drop off.";
  let level: HealthInsight["level"] | undefined;

  if (dayDiff > 365) {
    message = "No commits have landed in more than a year.";
    suggestion =
      "Start with a small maintenance pass, such as dependency updates, docs fixes, or triage.";
    level = "critical";
  } else if (dayDiff > 90) {
    message = "No commits have landed in the last 90 days.";
    suggestion =
      "Plan a near-term maintenance cycle to show the project is still being looked after.";
    level = "warning";
  } else if (dayDiff <= 7) {
    message = `There were commits in the last 7 days, and the recent trend is ${trendLabel}.`;
  } else if (dayDiff <= 30) {
    message = `There were commits in the last 30 days, and the recent trend is ${trendLabel}.`;
  }

  return {
    score,
    insight: createInsight("activity", score, message, suggestion, level),
  };
}

function scoreCommunity(data: RepoDataDraft): {
  score: number;
  insight: HealthInsight;
} {
  const newContributorCutoff = subDays(new Date(), 90).getTime();
  const hasRecentNewContributor = data.contributors.some(
    (contributor) => contributor.firstCommit.getTime() >= newContributorCutoff,
  );
  const isSoloProject = data.totalContributors === 1;

  if (isSoloProject) {
    const activeRecently = data.lastCommitAt.getTime() >= subDays(new Date(), 90).getTime();
    const score = activeRecently ? 55 : 40;

    return {
      score,
      insight: createInsight(
        "community",
        score,
        "This looks like a solo-maintained project. A bus factor of 1 is expected here, but the codebase still depends on one maintainer.",
        "If you want to grow past solo maintenance, keep contribution docs current and carve out small starter issues.",
        activeRecently ? "warning" : "critical",
      ),
    };
  }

  let busFactorPoints = 0;
  if (data.busFactor >= 3) {
    busFactorPoints = 40;
  } else if (data.busFactor === 2) {
    busFactorPoints = 25;
  } else if (data.busFactor === 1) {
    busFactorPoints = 10;
  }

  let contributorPoints = 0;
  if (data.totalContributors > 10) {
    contributorPoints = 30;
  } else if (data.totalContributors >= 3) {
    contributorPoints = 20;
  } else if (data.totalContributors >= 1) {
    contributorPoints = 10;
  }

  const score = clampScore(
    busFactorPoints + contributorPoints + (hasRecentNewContributor ? 30 : 0),
  );

  if (data.busFactor === 1) {
    return {
      score,
      insight: createInsight(
        "community",
        score,
        "Only 1 person contributed 50% of the code.",
        "Encourage more teammates to work on core paths so the project is not blocked on a single maintainer.",
        "critical",
      ),
    };
  }

  const message = hasRecentNewContributor
    ? "New contributors have joined in the last three months, which is a healthy sign."
    : "No new contributors showed up in the last three months.";
  const suggestion = hasRecentNewContributor
    ? "Keep the contribution path easy to follow so new contributors stick around."
    : "Improve onboarding, contributor docs, and issue labeling to lower the first-contribution barrier.";

  return {
    score,
    insight: createInsight("community", score, message, suggestion),
  };
}

function scoreDocumentation(data: RepoDataDraft): {
  score: number;
  insight: HealthInsight;
} {
  const signals = getSignals(data);
  const score = clampScore(
    (signals.readmeExists ? 40 : 0) +
      (data.license ? 25 : 0) +
      (signals.hasContributing || signals.hasChangelog ? 20 : 0) +
      (signals.readmeWordCount > 1000 ? 15 : 0),
  );

  if (!signals.readmeExists && !data.license) {
    return {
      score,
      insight: createInsight(
        "documentation",
        score,
        "README and LICENSE are both missing, so the project has no clear docs entry point or license metadata.",
        "Start by adding a README and LICENSE so users know what the project does and how it is licensed.",
        "critical",
      ),
    };
  }

  if (!signals.readmeExists) {
    return {
      score,
      insight: createInsight(
        "documentation",
        score,
        "README is missing, so the repository lacks a basic entry point for users and contributors.",
        "Add a README that covers purpose, setup, and the project layout.",
        "warning",
      ),
    };
  }

  return {
    score,
    insight: createInsight(
      "documentation",
      score,
      signals.readmeWordCount > 1000
        ? "README, license data, and contributor-facing docs look reasonably complete."
        : "The docs basics are in place, but the project could still explain more.",
      "Keep filling in contribution, release, and troubleshooting docs as the project grows.",
    ),
  };
}

function scoreMaintenance(data: RepoDataDraft): {
  score: number;
  insight: HealthInsight;
} {
  if (data.source === "local") {
    return {
      score: 50,
      insight: createInsight(
        "maintenance",
        50,
        "Local repositories do not expose issue and PR data, so maintenance is scored neutrally here.",
        "Use GitHub mode if you want issue and PR signals in the maintenance score.",
        "warning",
      ),
    };
  }

  const openIssues = data.openIssues ?? 0;
  let issuePoints = 10;
  if (openIssues < 10) {
    issuePoints = 50;
  } else if (openIssues <= 50) {
    issuePoints = 30;
  } else if (openIssues <= 100) {
    issuePoints = 20;
  }

  const score = clampScore(
    issuePoints +
      ((data.openPRs ?? 0) > 0 ? 20 : 0) +
      ((data.closedIssues ?? 0) > 0 ? 30 : 0),
  );

  const message =
    (data.openPRs ?? 0) > 0
      ? "There are open PRs, which suggests the maintenance loop is still active."
      : "There are no open PRs right now, so visible maintenance activity may be thin.";
  const suggestion =
    (data.closedIssues ?? 0) > 0
      ? "Keep closing issues at a steady pace and avoid letting the backlog pile up."
      : "Try to close the loop on at least a few recent issues so the repo does not feel abandoned.";

  return {
    score,
    insight: createInsight("maintenance", score, message, suggestion),
  };
}

function scoreSecurity(data: RepoDataDraft): {
  score: number;
  insight: HealthInsight;
} {
  const signals = getSignals(data);
  const score = clampScore(
    (signals.hasPackageJson && signals.hasLockfile ? 25 : 0) +
      (signals.hasLockfile ? 25 : 0) +
      (signals.hasDependabot ? 50 : 0),
  );

  if (signals.hasPackageJson && !signals.hasLockfile) {
    return {
      score,
      insight: createInsight(
        "security",
        score,
        "package.json exists, but there is no lockfile.",
        "Commit a lockfile such as package-lock.json, pnpm-lock.yaml, or yarn.lock so dependency versions stay reproducible.",
        "warning",
      ),
    };
  }

  if (data.source === "local" && (signals.dependencyCount ?? 0) > 100) {
    return {
      score,
      insight: createInsight(
        "security",
        score,
        `The local repository declares ${signals.dependencyCount} dependencies, which increases supply-chain surface area.`,
        "Trim unused dependencies and add audit or automated update tooling where possible.",
        "warning",
      ),
    };
  }

  return {
    score,
    insight: createInsight(
      "security",
      score,
      signals.hasDependabot
        ? "Lockfiles and Dependabot are both present, which is a solid baseline."
        : "Dependency maintenance signals are limited right now.",
      "Enable lockfiles and automated update tooling to reduce supply-chain risk.",
    ),
  };
}

export function scoreRepositoryHealth(data: RepoDataDraft): HealthScore {
  const activity = scoreActivity(data);
  const community = scoreCommunity(data);
  const documentation = scoreDocumentation(data);
  const maintenance = scoreMaintenance(data);
  const security = scoreSecurity(data);

  const total = clampScore(
    activity.score * 0.3 +
      community.score * 0.25 +
      documentation.score * 0.2 +
      maintenance.score * 0.15 +
      security.score * 0.1,
  );

  return {
    total,
    activity: activity.score,
    community: community.score,
    documentation: documentation.score,
    maintenance: maintenance.score,
    security: security.score,
    insights: [
      activity.insight,
      community.insight,
      documentation.insight,
      maintenance.insight,
      security.insight,
    ],
  };
}
