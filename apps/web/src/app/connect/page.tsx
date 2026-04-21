'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ConnectPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto py-16 text-center"><p className="text-[#8b949e]">Loading...</p></div>}>
      <ConnectInner />
    </Suspense>
  );
}

function ConnectInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setError('No device code provided. Open this page from VS Code.');
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
          setError(data.error || 'Failed to link device.');
          setStatus('error');
        }
      })
      .catch(() => {
        setError('Network error.');
        setStatus('error');
      });
  }, [code]);

  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <h1 className="text-2xl font-bold text-white mb-6">Link Device</h1>

      {status === 'loading' && <p className="text-[#8b949e]">Linking your device...</p>}

      {status === 'error' && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {status === 'success' && (
        <div>
          <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded mb-6">
            Device linked successfully!
          </div>
          <p className="text-sm text-[#8b949e] mb-4">
            Copy this device token and paste it into your VS Code settings or CLI config.
            This token is shown only once.
          </p>
          <code className="block bg-[#0d1117] border border-[#30363d] text-sm p-4 rounded break-all text-white select-all">
            {token}
          </code>
          <p className="text-xs text-[#8b949e] mt-4">
            Store this token securely. You can revoke it in{' '}
            <a href="/settings">Settings → Devices</a>.
          </p>
        </div>
      )}
    </div>
  );
}
