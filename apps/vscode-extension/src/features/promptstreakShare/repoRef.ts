/** Resolve PromptStreak repoRef with privacy-aware redaction. */

import { RepoAttributionRow } from '../../core/repoAttribution';
import { ShareRepoRefInput, ShareRepoRunInput } from './types';

const GITHUB_PUBLIC_HOST = 'github.com';
export const NON_PUBLIC_REPO_LABEL = 'Non-Public';
const VISIBILITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const visibilityCache = new Map<string, { value: boolean; expiresAt: number }>();

export type GithubRepoVisibilityChecker = (repoSlug: string) => Promise<boolean>;

function parseRemoteHost(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  // git@github.com:owner/repo.git
  const scpStyle = trimmed.match(/^[^@\s]+@([^:\s]+):.+$/);
  if (scpStyle?.[1]) {
    return scpStyle[1].toLowerCase();
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

async function isPublicGithubRepoViaApi(repoSlug: string): Promise<boolean> {
  const now = Date.now();
  const cached = visibilityCache.get(repoSlug);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const parts = repoSlug.split('/').filter(Boolean);
  if (parts.length !== 2) {
    return false;
  }

  const [owner, repo] = parts;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'copilot-usage-vscode-extension',
      },
    });

    if (!response.ok) {
      visibilityCache.set(repoSlug, {
        value: false,
        expiresAt: now + VISIBILITY_CACHE_TTL_MS,
      });
      return false;
    }

    const payload = await response.json() as { private?: unknown; visibility?: unknown };

    if (typeof payload.private === 'boolean') {
      const value = payload.private === false;
      visibilityCache.set(repoSlug, {
        value,
        expiresAt: now + VISIBILITY_CACHE_TTL_MS,
      });
      return value;
    }

    if (typeof payload.visibility === 'string') {
      const value = payload.visibility.toLowerCase() === 'public';
      visibilityCache.set(repoSlug, {
        value,
        expiresAt: now + VISIBILITY_CACHE_TTL_MS,
      });
      return value;
    }

    visibilityCache.set(repoSlug, {
      value: false,
      expiresAt: now + VISIBILITY_CACHE_TTL_MS,
    });
    return false;
  } catch {
    visibilityCache.set(repoSlug, {
      value: false,
      expiresAt: now + VISIBILITY_CACHE_TTL_MS,
    });
    return false;
  }
}

function asNonPublicAlias(): ShareRepoRefInput {
  return {
    mode: 'alias',
    aliasLabel: NON_PUBLIC_REPO_LABEL,
  };
}

function hasAnyUsage(rows: RepoAttributionRow[]): boolean {
  return rows.some(row => row.requests > 0 || row.promptTokens > 0 || row.outputTokens > 0);
}

function hasRowUsage(row: RepoAttributionRow): boolean {
  return row.requests > 0 || row.promptTokens > 0 || row.outputTokens > 0;
}

function repoRefKey(repoRef: ShareRepoRefInput): string {
  if (repoRef.mode === 'github') {
    return `github:${repoRef.githubRepo}`;
  }
  if (repoRef.mode === 'alias') {
    return `alias:${repoRef.aliasLabel}`;
  }
  return 'redacted';
}

function sanitizeTopModel(model: string | undefined): string | undefined {
  if (!model || model === '–') {
    return undefined;
  }
  return model;
}

async function resolveRepoRefForRow(
  row: RepoAttributionRow,
  visibilityChecker: GithubRepoVisibilityChecker,
): Promise<ShareRepoRefInput> {
  if (!row.remoteSlug) {
    return asNonPublicAlias();
  }

  const remoteHost = row.remoteUrl ? parseRemoteHost(row.remoteUrl) : undefined;
  if (remoteHost !== GITHUB_PUBLIC_HOST) {
    return asNonPublicAlias();
  }

  const isPublic = await visibilityChecker(row.remoteSlug);
  if (!isPublic) {
    return asNonPublicAlias();
  }

  return {
    mode: 'github',
    githubRepo: row.remoteSlug,
  };
}

export async function resolveShareRepoRuns(
  rows: RepoAttributionRow[],
  visibilityChecker: GithubRepoVisibilityChecker = isPublicGithubRepoViaApi,
): Promise<ShareRepoRunInput[]> {
  const usageRows = rows.filter(row => hasRowUsage(row));
  if (usageRows.length === 0) {
    return [];
  }

  const buckets = new Map<string, { run: ShareRepoRunInput; totalTokens: number }>();

  for (const row of usageRows) {
    const repoRef = await resolveRepoRefForRow(row, visibilityChecker);
    const key = repoRefKey(repoRef);
    const rowPrompt = Math.max(0, row.promptTokens);
    const rowOutput = Math.max(0, row.outputTokens);
    const rowPremium = Math.max(0, row.premiumRequests || 0);
    const rowTokens = rowPrompt + rowOutput;
    const rowRequests = Math.max(0, row.requests);
    const topModel = sanitizeTopModel(row.topModel);

    const existing = buckets.get(key);
    if (existing) {
      existing.run.totalRequests += rowRequests;
      existing.run.totalPromptTokens += rowPrompt;
      existing.run.totalOutputTokens += rowOutput;
      existing.run.totalPremiumRequests = (existing.run.totalPremiumRequests || 0) + rowPremium;

      const existingTokens = existing.totalTokens;
      if (topModel && rowTokens >= existingTokens) {
        existing.run.topModel = topModel;
      }

      existing.totalTokens += rowTokens;
      continue;
    }

    buckets.set(key, {
      run: {
        repoRef,
        totalRequests: rowRequests,
        totalPromptTokens: rowPrompt,
        totalOutputTokens: rowOutput,
        totalPremiumRequests: rowPremium,
        topModel,
      },
      totalTokens: rowTokens,
    });
  }

  return [...buckets.values()]
    .map(bucket => bucket.run)
    .sort((a, b) => {
      const aTotal = a.totalPromptTokens + a.totalOutputTokens;
      const bTotal = b.totalPromptTokens + b.totalOutputTokens;
      if (bTotal !== aTotal) {
        return bTotal - aTotal;
      }
      return repoRefKey(a.repoRef).localeCompare(repoRefKey(b.repoRef));
    });
}

export async function resolveShareRepoRef(
  rows: RepoAttributionRow[],
  visibilityChecker: GithubRepoVisibilityChecker = isPublicGithubRepoViaApi,
): Promise<ShareRepoRefInput | undefined> {
  const runs = await resolveShareRepoRuns(rows, visibilityChecker);
  if (runs.length > 0) {
    const publicGithub = runs.find(run => run.repoRef.mode === 'github');
    return publicGithub ? publicGithub.repoRef : runs[0].repoRef;
  }

  return hasAnyUsage(rows) ? asNonPublicAlias() : undefined;
}
