'use client';
import { useEffect, useState } from 'react';
import { getPermitStatus, RANK_COLORS } from '@/lib/utils';

interface Employee {
  id: string;
  full_name: string;
  passport_no: string | null;
  permit_no: string | null;
  permit_expire: string | null;
  phone: string | null;
  daily_rate: number;
  rank: string | null;
  bank_name: string | null;
  bank_account: string | null;
  passport_doc_url: string | null;
  permit_doc_url: string | null;
  status: string;
}

export default function MyProfilePage() {
  const [emp, setEmp]       = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/employees')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setEmp(list[0] || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>;
  if (!emp) return <div className="p-6 text-center text-gray-400">Profile not found. Contact your manager.</div>;

  const permitStatus = emp.permit_expire ? getPermitStatus(emp.permit_expire) : null;
  const rankColor = emp.rank ? (RANK_COLORS[emp.rank] || 'bg-gray-100 text-gray-600') : '';

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">My Profile</h1>

      <div className="card space-y-0 divide-y divide-gray-100">
        {/* Header */}
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
            {emp.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">{emp.full_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {emp.rank && <span className={`badge ${rankColor}`}>{emp.rank}</span>}
              <span className={`badge ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {emp.status}
              </span>
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Passport No." value={emp.passport_no} />
            <Field label="Phone" value={emp.phone} />
            <Field label="Daily Rate" value={`RM ${Number(emp.daily_rate).toFixed(2)}`} />
            <Field label="Bank" value={emp.bank_name} />
            <Field label="Bank Account" value={emp.bank_account} />
          </div>
        </div>

        {/* Permit Info */}
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Work Permit</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Permit No." value={emp.permit_no} />
            <div>
              <p className="text-xs text-gray-400 mb-1">Expiry Date</p>
              {emp.permit_expire ? (
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(emp.permit_expire).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {permitStatus && (
                    <p className={`text-xs mt-0.5 ${permitStatus.cls}`}>{permitStatus.label}</p>
                  )}
                </div>
              ) : <p className="text-sm text-gray-400">Not set</p>}
            </div>
          </div>
        </div>

        {/* Documents */}
        {(emp.passport_doc_url || emp.permit_doc_url) && (
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
            <div className="flex gap-3 flex-wrap">
              {emp.passport_doc_url && (
                <a href={emp.passport_doc_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-outline btn-sm">
                  📄 Passport Doc
                </a>
              )}
              {emp.permit_doc_url && (
                <a href={emp.permit_doc_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-outline btn-sm">
                  📄 Permit Doc
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Contact your manager to update your profile information.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}
