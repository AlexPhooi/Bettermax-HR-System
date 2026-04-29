'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Inline brand SVG icon ──────────────────────────────────────────────
function BrandIcon({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <polyline points="14,88 100,16 186,88"
        fill="none" stroke="#C9A84C" strokeWidth="6"
        strokeLinejoin="miter" strokeLinecap="square"/>
      <rect x="22"  y="88"  width="24" height="88"  fill="#C9A84C"/>
      <rect x="88"  y="62"  width="24" height="114" fill="#E8D5A3"/>
      <rect x="154" y="88"  width="24" height="88"  fill="#C9A84C"/>
      <rect x="22"  y="130" width="156" height="6"  fill="#C9A84C" opacity=".4"/>
      <rect x="92"  y="74"  width="16" height="18"  fill="#1A0E06"/>
      <rect x="92"  y="102" width="16" height="22"  fill="#1A0E06"/>
      <rect x="10"  y="176" width="180" height="8"  fill="#C9A84C"/>
    </svg>
  );
}

// ── Full horizontal logo block ─────────────────────────────────────────
function FullLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <BrandIcon size={80} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ fontFamily: 'Georgia, serif', color: '#E8D5A3', fontSize: 30, fontWeight: 700, letterSpacing: 2, lineHeight: 1, margin: 0 }}>
          BETTERMAX
        </p>
        <div style={{ height: '0.8px', background: '#C9A84C', width: '100%' }} />
        <p style={{ fontFamily: 'Georgia, serif', color: '#C9A84C', fontSize: 12, letterSpacing: 5, margin: 0 }}>
          ENTERPRISE
        </p>
        <p style={{ fontFamily: 'Arial, sans-serif', color: '#C49A6C', fontSize: 11, letterSpacing: 4, margin: 0 }}>
          贝 得 蜜 企 业
        </p>
        <div style={{ height: '0.4px', background: '#C9A84C', opacity: 0.35, width: '100%' }} />
        <p style={{ fontFamily: 'Arial, sans-serif', color: '#6B4226', fontSize: 7.5, letterSpacing: 1.5, margin: 0, textTransform: 'uppercase' }}>
          House Extension &amp; Renovation Specialist
        </p>
      </div>
    </div>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }} className="md:flex-row">

      {/* ── Left panel — brand identity ─────────────────────────── */}
      <div
        style={{ background: '#1A0E06', flex: '1 1 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', minHeight: '200px' }}
        className="md:min-h-screen">
        <FullLogo />
      </div>

      {/* ── Right panel — login form ─────────────────────────────── */}
      <div
        style={{ background: '#FAF5E9', flex: '1 1 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}
        className="md:min-h-screen">
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 10,
            borderTop: '3px solid #C9A84C',
            padding: '36px 32px',
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

          {/* Footer note */}
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#C49A6C', fontFamily: 'Arial, sans-serif' }}>
            © {new Date().getFullYear()} Bettermax Enterprise
          </p>
        </div>
      </div>
    </div>
  );
}
