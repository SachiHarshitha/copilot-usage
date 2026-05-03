'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/app/components/i18n-provider';

export default function ConnectPage() {
  const { dictionary } = useI18n();

  return (
    <Suspense fallback={<div className="max-w-lg mx-auto py-16 text-center"><p className="text-[var(--text-secondary)]">{dictionary.connect.loading}</p></div>}>
      <ConnectInner />
    </Suspense>
  );
}

function ConnectInner() {
  const { dictionary } = useI18n();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setError(dictionary.connect.noCode);
      return;
    }

    fetch('/api/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setToken(data.deviceToken);
          setStatus('success');
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || dictionary.connect.failed);
          setStatus('error');
        }
      })
      .catch(() => {
        setError(dictionary.connect.networkError);
        setStatus('error');
      });
  }, [code, dictionary]);

  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">{dictionary.connect.title}</h1>

      {status === 'loading' && <p className="text-[var(--text-secondary)]">{dictionary.connect.linking}</p>}

      {status === 'error' && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {status === 'success' && (
        <div>
          <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded mb-6">
            {dictionary.connect.success}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {dictionary.connect.copyHint}
          </p>
          <code className="block bg-[var(--background)] border border-[var(--card-border)] text-sm p-4 rounded break-all text-[var(--foreground)] select-all">
            {token}
          </code>
          <p className="text-xs text-[var(--text-secondary)] mt-4">
            {dictionary.connect.secureHint}{' '}
            <a href="/settings">{dictionary.connect.settingsDevices}</a>.
          </p>
        </div>
      )}
    </div>
  );
}
