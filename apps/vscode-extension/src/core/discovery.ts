/** Discover Copilot chat session files in VS Code workspace storage. */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceInfo } from './types';

/**
 * Return platform-specific VS Code workspace storage roots.
 *
 * When `appName` contains "Insiders" (e.g. `vscode.env.appName`), the Insiders
 * root is returned first so that workspace lookups prefer the current host's
 * storage over the stable installation's storage.
 */
export function getWorkspaceStorageRoots(appName?: string): string[] {
  const isInsiders = appName?.toLowerCase().includes('insiders') ?? false;
  switch (process.platform) {
    case 'win32': {
      const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const stable = path.join(appdata, 'Code', 'User', 'workspaceStorage');
      const insiders = path.join(appdata, 'Code - Insiders', 'User', 'workspaceStorage');
      return isInsiders ? [insiders, stable] : [stable, insiders];
    }
    case 'darwin': {
      const stable = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
      const insiders = path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage');
      return isInsiders ? [insiders, stable] : [stable, insiders];
    }
    default: {
      const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      const stable = path.join(config, 'Code', 'User', 'workspaceStorage');
      const insiders = path.join(config, 'Code - Insiders', 'User', 'workspaceStorage');
      return isInsiders ? [insiders, stable] : [stable, insiders];
    }
  }
}

/** Strip a URI scheme and decode percent-encoding → plain file path. */
function uriToPath(uri: string): string {
  if (uri.startsWith('file:///')) {
    return decodeURIComponent(uri.slice(8));
  }
  if (uri.startsWith('vscode-userdata:///')) {
    return decodeURIComponent(uri.slice('vscode-userdata:///'.length));
  }
  return decodeURIComponent(uri);
}

/** Resolve workspace.json → human-readable workspace path + any referenced folder paths. */
async function resolveWorkspace(workspaceDir: string): Promise<{ id: string; path: string; referencedFolders: string[] }> {
  const id = path.basename(workspaceDir);
  let wsPath = '';
  const referencedFolders: string[] = [];
  const wsJson = path.join(workspaceDir, 'workspace.json');
  try {
    const raw = await fs.readFile(wsJson, 'utf-8');
    const data = JSON.parse(raw);
    const uri: string = data.folder || data.workspace || '';
    if (uri) { wsPath = uriToPath(uri); }

    // For multi-root workspaces, read the referenced workspace.json and
    // extract its folder list so we can match by folder path in Strategy 3.
    if (data.workspace && wsPath) {
      try {
        const wsRaw = await fs.readFile(wsPath, 'utf-8');
        const wsData = JSON.parse(wsRaw);
        if (Array.isArray(wsData.folders)) {
          for (const f of wsData.folders) {
            const folderPath: string = f.uri ? uriToPath(f.uri) : f.path || '';
            if (folderPath) { referencedFolders.push(folderPath); }
          }
        }
      } catch {
        // workspace.json unreadable or malformed — fine
      }
    }
  } catch {
    // workspace.json missing or malformed — fine
  }
  return { id, path: wsPath, referencedFolders };
}

/** Discover all workspaces that have chatSessions with JSONL or JSON files. */
export async function discoverWorkspaces(
  storageRoots?: string[],
): Promise<WorkspaceInfo[]> {
  const roots = storageRoots || getWorkspaceStorageRoots();
  const results: WorkspaceInfo[] = [];

  for (const root of roots) {
    let dirs: string[];
    try {
      dirs = await fs.readdir(root);
    } catch {
      continue; // root doesn't exist or is unreadable — skip it
    }

    for (const dirName of dirs) {
      const wsDir = path.join(root, dirName);
      const sessionsDir = path.join(wsDir, 'chatSessions');
      try {
        const stat = await fs.stat(sessionsDir);
        if (!stat.isDirectory()) { continue; }
      } catch {
        continue;
      }

      const ws = await resolveWorkspace(wsDir);
      const files: string[] = [];
      try {
        for (const f of await fs.readdir(sessionsDir)) {
          const ext = path.extname(f).toLowerCase();
          if (ext === '.jsonl' || ext === '.json') {
            files.push(path.join(sessionsDir, f));
          }
        }
      } catch {
        continue;
      }

      if (files.length > 0) {
        results.push({
          workspaceId: ws.id,
          workspacePath: ws.path,
          referencedFolders: ws.referencedFolders,
          sessionFiles: files,
        });
      }
    }
  }

  // De-duplicate by workspaceId: when both stable and Insiders roots contain
  // entries for the same workspace, merge their session files and referenced
  // folders so downstream sees a unified view across all installations.
  const merged = new Map<string, WorkspaceInfo>();
  for (const ws of results) {
    const existing = merged.get(ws.workspaceId);
    if (existing) {
      existing.sessionFiles = [...existing.sessionFiles, ...ws.sessionFiles];
      if (!existing.workspacePath && ws.workspacePath) {
        existing.workspacePath = ws.workspacePath;
      }
      if (ws.referencedFolders) {
        existing.referencedFolders = [
          ...(existing.referencedFolders ?? []),
          ...ws.referencedFolders,
        ];
      }
    } else {
      merged.set(ws.workspaceId, { ...ws });
    }
  }
  return [...merged.values()];
}

/**
 * Compute a lightweight signature of tracked chat session files.
 *
 * Used as a polling fallback when file watchers miss events. The signature
 * changes when the number of tracked files changes, file sizes change, or
 * newest modification time changes.
 */
export async function computeChatSessionsSignature(storageRoots?: string[]): Promise<string> {
  const roots = storageRoots || getWorkspaceStorageRoots();

  let fileCount = 0;
  let totalBytes = 0;
  let newestMtimeMs = 0;

  for (const root of roots) {
    let dirs: string[];
    try {
      dirs = await fs.readdir(root);
    } catch {
      continue; // root doesn't exist — skip
    }

    for (const dirName of dirs) {
      const sessionsDir = path.join(root, dirName, 'chatSessions');

      let files: string[];
      try {
        files = await fs.readdir(sessionsDir);
      } catch {
        continue;
      }

      for (const fileName of files) {
        const ext = path.extname(fileName).toLowerCase();
        if (ext !== '.jsonl' && ext !== '.json') { continue; }

        try {
          const stat = await fs.stat(path.join(sessionsDir, fileName));
          if (!stat.isFile()) { continue; }

          fileCount++;
          totalBytes += stat.size;
          const mtimeMs = Number(stat.mtimeMs) || 0;
          if (mtimeMs > newestMtimeMs) { newestMtimeMs = mtimeMs; }
        } catch {
          // File may disappear during scan; safe to ignore.
        }
      }
    }
  }

  return `${fileCount}:${totalBytes}:${Math.floor(newestMtimeMs)}`;
}

/** Find workspace info for a specific workspace folder path. */
export async function findWorkspaceByPath(
  folderPath: string,
  storageRoots?: string[],
): Promise<WorkspaceInfo | undefined> {
  const workspaces = await discoverWorkspaces(storageRoots);
  const normTarget = normalizePath(folderPath);
  return workspaces.find(ws => normalizePath(ws.workspacePath) === normTarget);
}

/**
 * Find workspace info by .code-workspace file path.
 * VS Code stores multi-root workspaces under the `workspace` key in workspace.json,
 * so we match against the stored workspace path directly.
 */
export async function findWorkspaceByFile(
  workspaceFilePath: string,
  storageRoots?: string[],
): Promise<WorkspaceInfo | undefined> {
  const workspaces = await discoverWorkspaces(storageRoots);
  const normTarget = normalizePath(workspaceFilePath);
  return workspaces.find(ws => normalizePath(ws.workspacePath) === normTarget);
}

/**
 * Try multiple strategies to find workspace data:
 * 1. Match by .code-workspace file (multi-root workspaces)
 * 2. Match by each workspace folder path
 * Returns the first match found.
 */
export async function findCurrentWorkspace(
  workspaceFileUri: string | undefined,
  folderPaths: string[],
  storageRoots?: string[],
): Promise<WorkspaceInfo | undefined> {
  const workspaces = await discoverWorkspaces(storageRoots);

  // Strategy 1: match by .code-workspace file path
  if (workspaceFileUri) {
    let wsFilePath = workspaceFileUri;
    if (wsFilePath.startsWith('file:///')) {
      wsFilePath = decodeURIComponent(wsFilePath.slice(8));
    } else if (wsFilePath.startsWith('vscode-userdata:///')) {
      // VS Code uses vscode-userdata:// for auto-created multi-root (untitled) workspaces
      wsFilePath = decodeURIComponent(wsFilePath.slice('vscode-userdata:///'.length));
    }
    const normFile = normalizePath(wsFilePath);
    const match = workspaces.find(ws => normalizePath(ws.workspacePath) === normFile);
    if (match) { return match; }
  }

  // Strategy 2: multi-root workspaces — match by folder list inside the referenced
  // workspace.json. Must run BEFORE the single-folder path match (Strategy 3) because
  // a multi-root storage entry's workspacePath points to a workspace.json file, not a
  // folder, but an old single-folder entry for the same folder path would wrongly match
  // first if we checked workspacePath equality before checking referencedFolders.
  //
  // When VS Code does not provide workspaceFileUri (some untitled multi-root flows),
  // still prioritize referenced-folder matching if more than one folder is open.
  if (workspaceFileUri || folderPaths.length > 1) {
    for (const fp of folderPaths) {
      const normFolder = normalizePath(fp);
      const match = workspaces.find(
        ws => (ws.referencedFolders ?? []).some(rf => normalizePath(rf) === normFolder),
      );
      if (match) { return match; }
    }
  }

  // Strategy 3: match by folder paths (single-folder workspaces)
  for (const fp of folderPaths) {
    const normFolder = normalizePath(fp);
    const match = workspaces.find(ws => normalizePath(ws.workspacePath) === normFolder);
    if (match) { return match; }
  }

  // Strategy 4: last-resort referenced-folder match when no workspaceFileUri was provided
  for (const fp of folderPaths) {
    const normFolder = normalizePath(fp);
    const match = workspaces.find(
      ws => (ws.referencedFolders ?? []).some(rf => normalizePath(rf) === normFolder),
    );
    if (match) { return match; }
  }

  return undefined;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
