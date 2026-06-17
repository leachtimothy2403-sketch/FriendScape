import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';
import ChildNav from '../components/ChildNav';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xp_required: number | null;
  earned_at?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  kindness:  'bg-pink-50 text-pink-600 border-pink-100',
  learning:  'bg-blue-50 text-blue-600 border-blue-100',
  social:    'bg-purple/10 text-purple border-purple/20',
  milestone: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  special:   'bg-green-50 text-green-600 border-green-100',
};

function BadgeCard({ badge, earned }: { badge: Badge; earned: boolean }) {
  const cat = CATEGORY_COLORS[badge.category] ?? 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <div className={`bg-white rounded-2xl border p-5 transition ${earned ? 'border-gray-100 hover:shadow-sm' : 'border-gray-100 opacity-60'}`}>
      <div className={`text-3xl mb-3 ${!earned ? 'grayscale' : ''}`}>{badge.icon}</div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-bold text-gray-800 text-sm leading-tight">{badge.name}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${cat}`}>
          {badge.category}
        </span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">{badge.description}</p>
      {earned && badge.earned_at ? (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-green-600 font-semibold">
            Earned {new Date(badge.earned_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      ) : (
        <span className="text-xs text-gray-400 font-medium">🔒 Not yet earned</span>
      )}
      {badge.xp_required && (
        <div className="mt-2 text-xs text-purple/70 font-medium">+{badge.xp_required} XP</div>
      )}
    </div>
  );
}

export default function BadgeProgress() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [earned, setEarned] = useState<Badge[]>([]);
  const [locked, setLocked] = useState<Badge[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    Promise.all([childrenApi.get(childId), parentApi.badges(childId)])
      .then(([cRes, bRes]) => {
        setChildName(cRes.data.child?.name ?? '');
        setEarned(bRes.data.earned ?? []);
        setLocked(bRes.data.locked ?? []);
        setTotalXp(bRes.data.totalXp ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  const total = earned.length + locked.length;
  const progress = total > 0 ? earned.length / total : 0;

  return (
    <div className="min-h-screen bg-bg">
      <ChildNav childId={childId!} childName={childName} active="badges" />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-800 mb-6">Badge Progress</h1>

        {!loading && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="text-2xl font-bold text-purple mb-1">{earned.length}</div>
              <div className="text-xs text-gray-500">Badges earned</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="text-2xl font-bold text-gray-400 mb-1">{locked.length}</div>
              <div className="text-xs text-gray-500">Still to earn</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="text-2xl font-bold text-yellow-500 mb-1">⭐ {totalXp}</div>
              <div className="text-xs text-gray-500">Total XP</div>
            </div>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Overall progress</span>
              <span className="text-sm font-bold text-purple">{earned.length}/{total}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple rounded-full transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-36 animate-pulse" />)}
          </div>
        ) : (
          <>
            {earned.length > 0 && (
              <section className="mb-8">
                <h2 className="text-base font-bold text-gray-700 mb-4">
                  ✅ Earned ({earned.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {earned.map((b) => <BadgeCard key={b.id} badge={b} earned />)}
                </div>
              </section>
            )}

            {locked.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-gray-700 mb-4">
                  🔒 Not yet earned ({locked.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {locked.map((b) => <BadgeCard key={b.id} badge={b} earned={false} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
