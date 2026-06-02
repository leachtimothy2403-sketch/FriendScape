import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { children as childrenApi, parent as parentApi, auth } from '../services/api';

interface Child {
  id: string;
  name: string;
  age: number;
  mascot: string;
  selectedPack: string;
}

interface Alert {
  id: string;
  child_id: string;
  child_name: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  read: boolean;
  created_at: string;
}

const TYPE_STYLES: Record<string, string> = {
  crisis:    'bg-red/10 border-red/30 text-red',
  mood_flag: 'bg-orange/10 border-orange/30 text-orange',
  milestone: 'bg-green/10 border-green/30 text-green',
  default:   'bg-purple/10 border-purple/30 text-purple',
};

const MASCOT_EMOJI: Record<string, string> = {
  luna: '🦉', cosmo: '🚀', pip: '🐸', finn: '🐬', sunny: '🌻',
};

export default function Dashboard() {
  const [childList, setChildList] = useState<Child[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([childrenApi.list(), parentApi.alerts()])
      .then(([childRes, alertRes]) => {
        setChildList(childRes.data.children);
        setAlerts(alertRes.data.alerts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await auth.logout().catch(() => {});
    localStorage.removeItem('parentToken');
    navigate('/login');
  }

  async function markRead(id: string) {
    setDismissing((prev) => new Set(prev).add(id));
    await parentApi.markRead(id).catch(() => {});
    setTimeout(() => {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
      setDismissing((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }, 300);
  }

  const unreadAlerts = alerts.filter((a) => !a.read);

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌈</span>
          <div>
            <h1 className="text-lg font-bold text-purple leading-none">Migo</h1>
            <p className="text-xs text-gray-400">Parent Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/settings" className="text-sm text-gray-500 hover:text-purple transition">Settings</Link>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red transition">Sign out</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {unreadAlerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              🔔 Alerts <span className="bg-red text-white text-xs px-2 py-0.5 rounded-full ml-2">{unreadAlerts.length}</span>
            </h2>
            <div className="space-y-3">
              {unreadAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-opacity duration-300 ${TYPE_STYLES[alert.type] ?? TYPE_STYLES.default} ${dismissing.has(alert.id) ? 'opacity-0' : 'opacity-100'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase opacity-70">{alert.child_name}</span>
                      <span className="text-xs opacity-50">·</span>
                      <span className="text-xs opacity-60">{alert.type}</span>
                    </div>
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {new Date(alert.created_at).toLocaleDateString('en', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => markRead(alert.id)} className="text-xs opacity-60 hover:opacity-100 font-medium whitespace-nowrap">
                    Mark read
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Your Children</h2>
          {loading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : childList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <div className="text-5xl mb-4">👶</div>
              <p className="text-gray-500 text-sm">
                No children set up yet. Open the Migo app to enrol your first child!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {childList.map((child) => (
                <Link
                  key={child.id}
                  to={`/children/${child.id}`}
                  className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-purple/40 hover:shadow-sm transition flex items-center gap-4"
                >
                  <div className="w-14 h-14 rounded-full bg-purple/10 flex items-center justify-center text-3xl">
                    {MASCOT_EMOJI[child.mascot] || '😊'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-lg">{child.name}</p>
                    <p className="text-sm text-gray-400">Age {child.age} · {child.selectedPack || 'Explorer'} Pack</p>
                  </div>
                  <span className="ml-auto text-sm font-semibold text-purple bg-purple/10 px-3 py-1.5 rounded-lg whitespace-nowrap">View activity →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
