/** Local persistence for PromptStreak share state and secrets. */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { ShareHistoryEntry } from './types';

const HISTORY_KEY = 'promptstreakShare.history.v1';
const TOKEN_KEY = 'promptstreakShare.deviceToken.v1';
const IDEMPOTENCY_SEED_KEY = 'promptstreakShare.idempotencySeed.v1';
const PENDING_LINK_STATE_KEY = 'promptstreakShare.pendingLinkState.v1';

export function loadShareHistory(ctx: vscode.ExtensionContext): ShareHistoryEntry[] {
  return ctx.globalState.get<ShareHistoryEntry[]>(HISTORY_KEY) || [];
}

export async function saveShareHistory(
  ctx: vscode.ExtensionContext,
  history: ShareHistoryEntry[],
): Promise<void> {
  await ctx.globalState.update(HISTORY_KEY, history);
}

export async function getDeviceToken(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return ctx.secrets.get(TOKEN_KEY);
}

export async function setDeviceToken(ctx: vscode.ExtensionContext, token: string): Promise<void> {
  await ctx.secrets.store(TOKEN_KEY, token);
}

export async function clearDeviceToken(ctx: vscode.ExtensionContext): Promise<void> {
  await ctx.secrets.delete(TOKEN_KEY);
}

export async function setPendingLinkState(
  ctx: vscode.ExtensionContext,
  state: string,
): Promise<void> {
  await ctx.globalState.update(PENDING_LINK_STATE_KEY, state);
}

export function getPendingLinkState(ctx: vscode.ExtensionContext): string | undefined {
  return ctx.globalState.get<string>(PENDING_LINK_STATE_KEY);
}

export async function clearPendingLinkState(ctx: vscode.ExtensionContext): Promise<void> {
  await ctx.globalState.update(PENDING_LINK_STATE_KEY, undefined);
}

export async function getOrCreateIdempotencySeed(ctx: vscode.ExtensionContext): Promise<string> {
  const existing = ctx.globalState.get<string>(IDEMPOTENCY_SEED_KEY);
  if (existing) {
    return existing;
  }

  const seed = randomBytes(12).toString('hex');
  await ctx.globalState.update(IDEMPOTENCY_SEED_KEY, seed);
  return seed;
}
