import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';
import ChildNav from '../components/ChildNav';

interface TimelineEvent {
  type: string;
  timestamp: string;
  summary: string;
  icon: string;
}

const TYPE_LABELS: Record<string, string> = {
  post: 'Posts', messages: 'Messages', badge: 'Badges', friend: 'Friends',
};

const TYPE_COLORS: Record<string, string> = {
  post:     'bg-purple/10 text-purple border-purple/20',
  messages: 'bg-blue-50 text-blue-600 border-blue-100',
  badge:    'bg-yellow-50 text-yellow-600 border-yellow-100',
  friend:   'bg-green-50 text-green-600 border-green-100',
};

const RANGES = [
  { label: 'Today',     days: 1 },
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityTimeline() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    Promise.all([
      childrenApi.get(childId),
      parentApi.timeline(childId),
    ])
      .then(([childRes, timelineRes]) => {
        setChildName(childRes.data.child?.name ?? '');
        setEvents(timelineRes.data.events ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const visible = events.filter((e) => {
    if (filter !== 'all' && e.type !== filter) return false;
    return new Date(e.timestamp) >= since;
  });

  return (
    <div className="min-h-screen bg-bg">
      <ChildNav childId={childId!} childName={childName} active="activity" />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-xl font-bold text-gray-800">Activity Timeline</h1>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${days === r.days ? 'bg-purple text-white' : 'text-gray-500 hover:text-purple'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === 'all' ? 'bg-purple text-white' : 'text-gray-500 hover:text-purple'}`}
              >
                All
              </button>
              {Object.entries(TYPE_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === k ? 'bg-purple text-white' : 'text-gray-500 hover:text-purple'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-16 animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400 text-sm">No activity in this period.</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-gray-100" />
            <div className="space-y-4">
              {visible.map((ev, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-lg flex-shrink-0 z-10 bg-white ${TYPE_COLORS[ev.type] ?? 'bg-gray-50 border-gray-200'}`}>
                    {ev.icon}
                  </div>
                  <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-4 mt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-800 font-medium leading-snug">{ev.summary}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${TYPE_COLORS[ev.type] ?? 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        {TYPE_LABELS[ev.type] ?? ev.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{fmt(ev.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
