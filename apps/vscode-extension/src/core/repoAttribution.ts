import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { RequestEvent, WorkspaceInfo } from './types';
import { getMultiplier } from './config';

const execFileAsync = promisify(execFile);

export interface RepoDescriptor {
  id: string;
  workspaceId: string;
  workspacePath: string;
  rootPath: string;
  displayName: string;
  remoteUrl?: string;
  remoteSlug?: string;
}

export interface RepoAttributionRow {
  id: string;
  displayName: string;
  workspaceId?: string;
  workspacePath?: string;
  remoteUrl?: string;
  remoteSlug?: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premiumRequests: number;
  topModel: string;
}

export interface RepoAttributionStats {
  workspaceTotals: {
    totalRequests: number;
    totalPromptTokens: number;
    totalOutputTokens: number;
  };
  rows: RepoAttributionRow[];
}

interface RepoWeight {
  repoId: string;
  weight: number;
}

interface WeightedModelStats {
  requests: number;
  tokens: number;
}

function normalizePath(p: string): string {
  let out = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[A-Za-z]:/.test(out)) {
    out = out[0].toLowerCase() + out.slice(1);
  }
  return out;
}

function normalizeEvidencePath(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/[),.;\]]+$/g, '');
  if (!trimmed) {
    return undefined;
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'file:') {
        return undefined;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(pathname)) {
        pathname = pathname.slice(1);
      }
      return normalizePath(pathname);
    } catch {
      return undefined;
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) {
    return normalizePath(trimmed);
  }

  return undefined;
}

function isWorkspaceFilePath(p: string): boolean {
  const norm = normalizePath(p);
  return norm.endsWith('.code-workspace') || norm.endsWith('/workspace.json');
}

async function runGit(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      windowsHide: true,
      timeout: 3000,
    });
    const value = stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function discoverRepoForFolder(folderPath: string): Promise<{ rootPath: string; remoteUrl?: string; remoteSlug?: string } | undefined> {
  const gitRoot = await runGit(['rev-parse', '--show-toplevel'], folderPath);
  if (!gitRoot) {
    return undefined;
  }

  const normalizedRoot = normalizePath(gitRoot);
  const remoteUrl =
    await runGit(['remote', 'get-url', 'origin'], normalizedRoot)
    ?? await runGit(['config', '--get', 'remote.origin.url'], normalizedRoot);

  return {
    rootPath: normalizedRoot,
    remoteUrl,
    remoteSlug: remoteUrl ? parseRemoteRepoSlug(remoteUrl) : undefined,
  };
}

export async function discoverRepoDescriptors(workspaces: WorkspaceInfo[]): Promise<RepoDescriptor[]> {
  const rows = new Map<string, RepoDescriptor>();

  for (const ws of workspaces) {
    const candidates: string[] = [];
    const referenced = ws.referencedFolders ?? [];

    if (referenced.length > 0) {
      for (const folder of referenced) {
        candidates.push(folder);
      }
    } else if (ws.workspacePath && !isWorkspaceFilePath(ws.workspacePath)) {
      candidates.push(ws.workspacePath);
    }

    for (const candidate of candidates) {
      const repo = await discoverRepoForFolder(candidate);
      if (!repo) {
        continue;
      }

      const key = `${ws.workspaceId}|${repo.rootPath}`;
      if (rows.has(key)) {
        continue;
      }

      rows.set(key, {
        id: key,
        workspaceId: ws.workspaceId,
        workspacePath: ws.workspacePath,
        rootPath: repo.rootPath,
        displayName: repo.remoteSlug || path.basename(repo.rootPath),
        remoteUrl: repo.remoteUrl,
        remoteSlug: repo.remoteSlug,
      });
    }
  }

  return [...rows.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function resolveRepoWeights(event: RequestEvent, repos: RepoDescriptor[]): RepoWeight[] {
  const workspaceRepos = event.workspaceId
    ? repos.filter(r => r.workspaceId === event.workspaceId)
    : repos;

  if (workspaceRepos.length === 0) {
    return [];
  }

  const evidencePaths = event.evidencePaths ?? [];
  if (evidencePaths.length > 0) {
    const hitCounts = new Map<string, number>();

    for (const evidence of evidencePaths) {
      const normEvidence = normalizeEvidencePath(evidence);
      if (!normEvidence) {
        continue;
      }

      let best: RepoDescriptor | undefined;
      let bestLen = -1;
      for (const repo of workspaceRepos) {
        const root = normalizePath(repo.rootPath);
        if (!normEvidence.startsWith(root)) {
          continue;
        }
        if (root.length > bestLen) {
          best = repo;
          bestLen = root.length;
        }
      }

      if (best) {
        hitCounts.set(best.id, (hitCounts.get(best.id) || 0) + 1);
      }
    }

    const totalHits = [...hitCounts.values()].reduce((sum, c) => sum + c, 0);
    if (totalHits > 0) {
      return [...hitCounts.entries()].map(([repoId, count]) => ({
        repoId,
        weight: count / totalHits,
      }));
    }
  }

  if (workspaceRepos.length === 1) {
    return [{ repoId: workspaceRepos[0].id, weight: 1 }];
  }

  return [];
}

export function computeRepoAttributionStats(
  events: RequestEvent[],
  repos: RepoDescriptor[],
): RepoAttributionStats {
  const rowsById = new Map<string, RepoAttributionRow>();
  const reposById = new Map<string, RepoDescriptor>(repos.map(repo => [repo.id, repo]));
  const modelStatsByRepoId = new Map<string, Map<string, WeightedModelStats>>();

  const addModelAttribution = (repoId: string, event: RequestEvent, weight: number): void => {
    const modelId = event.modelId || 'unknown';
    const totalTokens = event.promptTokens + event.outputTokens;

    let modelStats = modelStatsByRepoId.get(repoId);
    if (!modelStats) {
      modelStats = new Map<string, WeightedModelStats>();
      modelStatsByRepoId.set(repoId, modelStats);
    }

    const existing = modelStats.get(modelId);
    if (existing) {
      existing.requests += weight;
      existing.tokens += totalTokens * weight;
      return;
    }

    modelStats.set(modelId, {
      requests: weight,
      tokens: totalTokens * weight,
    });
  };

  const resolveTopModel = (repoId: string): string => {
    const modelStats = modelStatsByRepoId.get(repoId);
    if (!modelStats || modelStats.size === 0) {
      return '–';
    }

    let bestModel = '–';
    let bestRequests = -1;
    let bestTokens = -1;

    for (const [modelId, stats] of modelStats.entries()) {
      if (
        stats.requests > bestRequests
        || (stats.requests === bestRequests && stats.tokens > bestTokens)
        || (stats.requests === bestRequests && stats.tokens === bestTokens && modelId.localeCompare(bestModel) < 0)
      ) {
        bestModel = modelId;
        bestRequests = stats.requests;
        bestTokens = stats.tokens;
      }
    }

    return bestModel;
  };

  const getOrCreateRow = (repo: RepoDescriptor): RepoAttributionRow => {
    const existing = rowsById.get(repo.id);
    if (existing) {
      return existing;
    }

    const next: RepoAttributionRow = {
      id: repo.id,
      displayName: repo.displayName,
      workspaceId: repo.workspaceId,
      workspacePath: repo.workspacePath,
      remoteUrl: repo.remoteUrl,
      remoteSlug: repo.remoteSlug,
      requests: 0,
      promptTokens: 0,
      outputTokens: 0,
      premiumRequests: 0,
      topModel: '–',
    };
    rowsById.set(repo.id, next);
    return next;
  };

  const unattributed: RepoAttributionRow = {
    id: 'unattributed',
    displayName: 'Unattributed',
    requests: 0,
    promptTokens: 0,
    outputTokens: 0,
    premiumRequests: 0,
    topModel: '–',
  };

  let totalRequests = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;

  for (const event of events) {
    totalRequests += 1;
    totalPromptTokens += event.promptTokens;
    totalOutputTokens += event.outputTokens;
    const hasTokenUsage = event.promptTokens > 0 || event.outputTokens > 0;
    const premiumRequests = hasTokenUsage ? getMultiplier(event.modelId || '', event.timestampMs) : 0;

    const weights = resolveRepoWeights(event, repos);
    if (weights.length === 0) {
      unattributed.requests += 1;
      unattributed.promptTokens += event.promptTokens;
      unattributed.outputTokens += event.outputTokens;
      unattributed.premiumRequests += premiumRequests;
      addModelAttribution(unattributed.id, event, 1);
      continue;
    }

    for (const weight of weights) {
      const repo = reposById.get(weight.repoId);
      if (!repo) {
        continue;
      }

      const row = getOrCreateRow(repo);
      row.requests += weight.weight;
      row.promptTokens += event.promptTokens * weight.weight;
      row.outputTokens += event.outputTokens * weight.weight;
      row.premiumRequests += premiumRequests * weight.weight;
      addModelAttribution(repo.id, event, weight.weight);
    }
  }

  for (const row of rowsById.values()) {
    row.topModel = resolveTopModel(row.id);
  }

  unattributed.topModel = resolveTopModel(unattributed.id);

  const rows = [...rowsById.values()];
  if (unattributed.requests > 0 || unattributed.promptTokens > 0 || unattributed.outputTokens > 0) {
    rows.push(unattributed);
  }

  rows.sort((a, b) => {
    const aTotal = a.promptTokens + a.outputTokens;
    const bTotal = b.promptTokens + b.outputTokens;
    return bTotal - aTotal;
  });

  return {
    workspaceTotals: {
      totalRequests,
      totalPromptTokens,
      totalOutputTokens,
    },
    rows,
  };
}

export function parseRemoteRepoSlug(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  // git@github.com:owner/repo.git
  const scpStyle = trimmed.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scpStyle && scpStyle[1]) {
    const slug = scpStyle[1].replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    const parts = slug.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  }

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
