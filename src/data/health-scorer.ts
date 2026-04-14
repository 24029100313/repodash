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
  let trendLabel = "下降";
  if (recentThreeMonths > previousThreeMonths) {
    trendRaw = 10;
    trendLabel = "增长";
  } else if (recentThreeMonths === previousThreeMonths) {
    trendRaw = 5;
    trendLabel = "持平";
  }

  const score = clampScore((recencyRaw + trendRaw) * 2);

  let message = `最近 3 个月提交趋势${trendLabel}。`;
  let suggestion = "继续保持稳定的提交节奏，避免活跃度回落。";
  let level: HealthInsight["level"] | undefined;

  if (dayDiff > 365) {
    message = "仓库已经超过 1 年没有新的提交。";
    suggestion = "优先安排一轮恢复性维护，例如修复小问题或更新文档。";
    level = "critical";
  } else if (dayDiff > 90) {
    message = "最近 90 天没有新的提交，活跃度明显偏低。";
    suggestion = "安排近期维护计划，把发布、修复或文档更新重新拉起来。";
    level = "warning";
  } else if (dayDiff <= 7) {
    message = `最近 7 天有提交，且最近 3 个月趋势${trendLabel}。`;
  } else if (dayDiff <= 30) {
    message = `最近 30 天有提交，且最近 3 个月趋势${trendLabel}。`;
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

  const hasRecentNewContributor = data.contributors.some(
    (contributor) => contributor.firstCommit.getTime() >= newContributorCutoff,
  );

  const score = clampScore(
    busFactorPoints + contributorPoints + (hasRecentNewContributor ? 30 : 0),
  );

  if (data.busFactor === 1) {
    return {
      score,
      insight: createInsight(
        "community",
        score,
        "只有 1 人贡献了 50% 的代码。",
        "鼓励团队成员参与核心功能开发，降低关键路径上的单点依赖。",
        "critical",
      ),
    };
  }

  const message = hasRecentNewContributor
    ? "最近 3 个月出现了新贡献者，社区活力较好。"
    : "最近 3 个月没有看到新贡献者加入。";
  const suggestion = hasRecentNewContributor
    ? "继续维护清晰的协作流程，帮助新贡献者留存。"
    : "完善贡献指南和 onboarding 流程，降低首次贡献门槛。";

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
        "README 和 LICENSE 都缺失，项目文档入口与授权信息都不完整。",
        "先补齐 README 和 LICENSE，明确项目用途、安装方式和授权条款。",
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
        "README 缺失，仓库缺少最基本的使用和维护说明。",
        "补充 README，至少覆盖项目目标、启动方式和关键目录说明。",
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
        ? "README、授权信息和协作文档信号比较完整。"
        : "文档基础已经具备，但深度还有提升空间。",
      "继续补充贡献指南、变更记录和更细致的开发文档。",
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
        "本地仓库缺少 issue 和 PR 数据，当前使用中性分。",
        "如果需要更准确的维护质量判断，可以切到 GitHub 仓库模式。",
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
    issuePoints + ((data.openPRs ?? 0) > 0 ? 20 : 0) + ((data.closedIssues ?? 0) > 0 ? 30 : 0),
  );

  const message =
    (data.openPRs ?? 0) > 0
      ? "当前存在 open PR，说明维护流程仍在运转。"
      : "当前没有 open PR，维护活动可能偏弱。";
  const suggestion =
    (data.closedIssues ?? 0) > 0
      ? "继续保持 issue 关闭节奏，并控制未解决问题的堆积。"
      : "优先清理最近一个月的 issue 闭环，提升维护反馈速度。";

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
        "检测到了 package.json，但没有 lockfile。",
        "提交 package-lock.json、pnpm-lock.yaml 或 yarn.lock，把依赖版本锁定下来。",
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
        `本地仓库检测到 ${signals.dependencyCount} 个依赖，供应链复杂度偏高。`,
        "梳理和精简依赖，并启用 audit、Dependabot 或其他依赖审计机制。",
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
        ? "检测到了 lockfile 和 Dependabot，依赖维护基础较好。"
        : "依赖安全信号有限，自动化更新和锁定策略还可以加强。",
      "启用 lockfile 与 Dependabot，降低供应链风险。",
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
