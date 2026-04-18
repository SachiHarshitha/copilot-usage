/** Discover Copilot chat session files in VS Code workspace storage. */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceInfo } from './types';

/** Return platform-specific VS Code workspace storage root. */
export function getWorkspaceStorageRoot(): string {
  switch (process.platform) {
    case 'win32': {
      const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appdata, 'Code', 'User', 'workspaceStorage');
    }
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
    default: {
      const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(config, 'Code', 'User', 'workspaceStorage');
    }
  }
}

/** Resolve workspace.json → human-readable workspace path. */
async function resolveWorkspace(workspaceDir: string): Promise<{ id: string; path: string }> {
  const id = path.basename(workspaceDir);
  let wsPath = '';
  const wsJson = path.join(workspaceDir, 'workspace.json');
  try {
    const raw = await fs.readFile(wsJson, 'utf-8');
    const data = JSON.parse(raw);
    const uri: string = data.folder || data.workspace || '';
    if (uri.startsWith('file:///')) {
      wsPath = decodeURIComponent(uri.slice(8));  // strip file:///
    } else if (uri) {
      wsPath = decodeURIComponent(uri);
    }
  } catch {
    // workspace.json missing or malformed — fine
  }
  return { id, path: wsPath };
}

/** Discover all workspaces that have chatSessions with JSONL or JSON files. */
export async function discoverWorkspaces(
  storageRoot?: string,
): Promise<WorkspaceInfo[]> {
  const root = storageRoot || getWorkspaceStorageRoot();
  const results: WorkspaceInfo[] = [];

  let dirs: string[];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return results;
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
        sessionFiles: files,
      });
    }
  }

  return results;
}

/** Find workspace info for a specific workspace folder path. */
export async function findWorkspaceByPath(
  folderPath: string,
  storageRoot?: string,
): Promise<WorkspaceInfo | undefined> {
  const workspaces = await discoverWorkspaces(storageRoot);
  const normTarget = normalizePath(folderPath);
  return workspaces.find(ws => normalizePath(ws.workspacePath) === normTarget);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
