'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Inline brand SVG icon — circle + white arch + gold trapezoid ──────
function BrandIcon({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="bmg-login" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF0A0"/>
          <stop offset="100%" stopColor="#FFB800"/>
        </linearGradient>
        <clipPath id="bmg-login-clip">
          <circle cx="50" cy="50" r="50"/>
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill="#1A0E06"/>
      <g clipPath="url(#bmg-login-clip)">
        <rect x="24" y="10" width="52" height="50" rx="10" ry="10" fill="white"/>
        <polygon points="30,60 70,60 84,100 16,100" fill="url(#bmg-login)"/>
      </g>
    </svg>
  );
}

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
      background: '#FAF5E9',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* ── Logo block ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28 }}>
          <BrandIcon size={72} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <p style={{ fontFamily: 'Georgia, serif', color: '#1A0E06', fontSize: 28, fontWeight: 700, letterSpacing: 2, lineHeight: 1, margin: 0 }}>
              BETTERMAX
            </p>
            <div style={{ height: '1px', background: '#C9A84C', width: '100%' }} />
            <p style={{ fontFamily: 'Georgia, serif', color: '#C9A84C', fontSize: 11, letterSpacing: 5, margin: 0 }}>
              ENTERPRISE
            </p>
            <p style={{ fontFamily: 'Arial, sans-serif', color: '#6B4226', fontSize: 10.5, letterSpacing: 3.5, margin: 0 }}>
              贝 得 蜜 企 业
            </p>
            <div style={{ height: '0.5px', background: '#C9A84C', opacity: 0.35, width: '100%' }} />
            <p style={{ fontFamily: 'Arial, sans-serif', color: '#9B7B5E', fontSize: 7, letterSpacing: 1.5, margin: 0, textTransform: 'uppercase' }}>
              House Extension &amp; Renovation Specialist
            </p>
          </div>
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
