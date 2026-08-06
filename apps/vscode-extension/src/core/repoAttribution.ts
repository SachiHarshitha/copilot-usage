import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import * as path from 'path';
import { RequestEvent, WorkspaceInfo } from './types';
import { getMultiplier } from './config';
import { creditsForRequest, CreditRateMap } from './credits';

const execFileAsync = promisify(execFile);
const NESTED_REPO_SCAN_MAX_DEPTH = 3;
const NESTED_REPO_SCAN_MAX_DIRS = 600;
const NESTED_REPO_SCAN_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.turbo',
]);

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
  credits: number;
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

async function discoverNestedRepoCandidates(rootPath: string): Promise<string[]> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootPath, depth: 0 }];
  const seen = new Set<string>([normalizePath(rootPath)]);
  const candidates: string[] = [];
  let visitedDirs = 0;

  while (queue.length > 0 && visitedDirs < NESTED_REPO_SCAN_MAX_DIRS) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    visitedDirs += 1;

    try {
      const entries = await fs.readdir(current.dir, { withFileTypes: true });

      if (entries.some(entry => entry.name === '.git')) {
        candidates.push(current.dir);
        continue;
      }

      if (current.depth >= NESTED_REPO_SCAN_MAX_DEPTH) {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (NESTED_REPO_SCAN_SKIP_DIRS.has(entry.name)) {
          continue;
        }

        const childDir = path.join(current.dir, entry.name);
        const normChild = normalizePath(childDir);
        if (seen.has(normChild)) {
          continue;
        }
        seen.add(normChild);
        queue.push({ dir: childDir, depth: current.depth + 1 });
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

function addRepoDescriptor(
  rows: Map<string, RepoDescriptor>,
  workspace: WorkspaceInfo,
  repo: { rootPath: string; remoteUrl?: string; remoteSlug?: string },
): void {
  const key = `${workspace.workspaceId}|${repo.rootPath}`;
  if (rows.has(key)) {
    return;
  }

  rows.set(key, {
    id: key,
    workspaceId: workspace.workspaceId,
    workspacePath: workspace.workspacePath,
    rootPath: repo.rootPath,
    displayName: repo.remoteSlug || path.basename(repo.rootPath),
    remoteUrl: repo.remoteUrl,
    remoteSlug: repo.remoteSlug,
  });
}

export async function discoverRepoDescriptors(
  workspaces: WorkspaceInfo[],
  openFolderPaths?: string[],
): Promise<RepoDescriptor[]> {
  const rows = new Map<string, RepoDescriptor>();

  for (const ws of workspaces) {
    const candidateFolders = new Set<string>();

    for (const folder of ws.referencedFolders ?? []) {
      candidateFolders.add(folder);
    }

    // Folders currently open in the window. This covers untitled / ad-hoc multi-root
    // workspaces where a folder was added without saving a `.code-workspace` file, so
    // the stored workspace.json does not list every open folder.
    for (const folder of openFolderPaths ?? []) {
      candidateFolders.add(folder);
    }

    if (candidateFolders.size === 0 && ws.workspacePath && !isWorkspaceFilePath(ws.workspacePath)) {
      candidateFolders.add(ws.workspacePath);
    }

    for (const folder of candidateFolders) {
      const repo = await discoverRepoForFolder(folder);
      if (repo) {
        addRepoDescriptor(rows, ws, repo);
        continue;
      }

      // The folder root is not a Git repo — it may be a non-git parent that contains
      // multiple child repos. Fall back to a bounded scan of nested repositories.
      const nestedCandidates = await discoverNestedRepoCandidates(folder);
      for (const nested of nestedCandidates) {
        const nestedRepo = await discoverRepoForFolder(nested);
        if (nestedRepo) {
          addRepoDescriptor(rows, ws, nestedRepo);
        }
      }
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
  options?: { includeEmptyRepos?: boolean; rates?: CreditRateMap },
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
      credits: 0,
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
    credits: 0,
    topModel: '–',
  };

  let totalRequests = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;

  // When requested, surface every discovered repo — including those without any
  // attributed usage — so all open folders are visible in the breakdown.
  if (options?.includeEmptyRepos) {
    for (const repo of repos) {
      getOrCreateRow(repo);
    }
  }

  for (const event of events) {
    totalRequests += 1;
    totalPromptTokens += event.promptTokens;
    totalOutputTokens += event.outputTokens;
    const hasTokenUsage = event.promptTokens > 0 || event.outputTokens > 0;
    const premiumRequests = hasTokenUsage ? getMultiplier(event.modelId || '', event.timestampMs) : 0;
    const credits = creditsForRequest(event.modelId, event.promptTokens, event.outputTokens, options?.rates);

    const weights = resolveRepoWeights(event, repos);
    if (weights.length === 0) {
      unattributed.requests += 1;
      unattributed.promptTokens += event.promptTokens;
      unattributed.outputTokens += event.outputTokens;
      unattributed.premiumRequests += premiumRequests;
      unattributed.credits += credits;
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
      row.credits += credits * weight.weight;
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
