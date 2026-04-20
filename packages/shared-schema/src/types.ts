/** Persisted in VS Code globalState — per-workspace repo identity preferences. */
export type RepoRefPrefs = Record<
  string,
  {
    mode: 'github' | 'alias' | 'redacted';
    value: string;
    detectedRemote?: string;
  }
>;
