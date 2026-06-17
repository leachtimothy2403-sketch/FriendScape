import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';
import ChildNav from '../components/ChildNav';

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  read: boolean;
  created_at: string;
}

const SEVERITY_STYLE: Record<string, { bar: string; badge: string; label: string }> = {
  urgent:  { bar: 'border-l-4 border-red/60 bg-red/5',     badge: 'bg-red/10 text-red',       label: '🚨 Crisis'  },
  warning: { bar: 'border-l-4 border-orange/60 bg-orange/5', badge: 'bg-orange/10 text-orange', label: '⚠️ Warning' },
  info:    { bar: 'border-l-4 border-purple/30 bg-purple/5', badge: 'bg-purple/10 text-purple', label: 'ℹ️ Info'    },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ParentAlerts() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    Promise.all([childrenApi.get(childId), parentApi.childAlerts(childId)])
      .then(([cRes, aRes]) => {
        setChildName(cRes.data.child?.name ?? aRes.data.child?.name ?? '');
        setAlerts(aRes.data.alerts ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  async function handleMarkRead(id: string) {
    setMarking((prev) => new Set(prev).add(id));
    await parentApi.markRead(id).catch(() => {});
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
    setMarking((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  const unread = alerts.filter((a) => !a.read);

  return (
    <div className="min-h-screen bg-bg">
      <ChildNav childId={childId!} childName={childName} active="alerts" />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">
            Safety Alerts
            {unread.length > 0 && (
              <span className="ml-2 bg-red text-white text-xs px-2 py-0.5 rounded-full align-middle">{unread.length}</span>
            )}
          </h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
            <div className="text-4xl mb-3">🌟</div>
            <p className="font-semibold text-gray-700">No alerts — {childName || 'your child'} is doing great!</p>
            <p className="text-xs text-gray-400 mt-2">Alerts appear here if our AI detects anything worth your attention.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => {
              const style = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info;
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl p-5 ${style.bar} ${a.read ? 'opacity-60' : ''} transition`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${style.badge}`}>
                          {style.label}
                        </span>
                        <span className="text-xs text-gray-400">{a.type}</span>
                        {a.read && <span className="text-xs text-gray-400">· Read</span>}
                      </div>
                      <p className="text-sm text-gray-800 font-medium leading-snug">{a.message}</p>
                      <p className="text-xs text-gray-400 mt-1.5">{fmt(a.created_at)}</p>
                    </div>
                    {!a.read && (
                      <button
                        onClick={() => handleMarkRead(a.id)}
                        disabled={marking.has(a.id)}
                        className="text-xs text-gray-500 hover:text-purple transition font-semibold flex-shrink-0 disabled:opacity-40"
                      >
                        {marking.has(a.id) ? '...' : 'Mark read'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
