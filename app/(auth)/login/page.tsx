'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push('/');
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* ── Real logo letterhead image ───────────────────────────── */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-letterhead.png"
            alt="Bettermax Enterprise"
            style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }}
          />
        </div>

        {/* ── Login card ──────────────────────────────────────────── */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E8D5A3',
          borderTop: '3px solid #C9A84C',
          padding: '36px 32px',
          boxShadow: '0 4px 24px rgba(26,14,6,0.08)',
        }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#2C1A0E', marginBottom: 4 }}>
            Sign In
          </h2>
          <p style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#6B4226', marginBottom: 24 }}>
            HR Management System
          </p>

          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center"
              style={{ padding: '10px 0', fontSize: 15, marginTop: 4 }}>
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </form>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#C49A6C', fontFamily: 'Arial, sans-serif' }}>
          © {new Date().getFullYear()} Bettermax Enterprise
        </p>
      </div>
    </div>
  );
}
