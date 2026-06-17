import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';
import ChildNav from '../components/ChildNav';

interface MoodDay {
  date: string;
  mood: string;
  intensity: number;
  note: string;
}

const MOOD_COLOR: Record<string, string> = {
  excited: '#5DCAA5', happy: '#5DCAA5', funny: '#5DCAA5', caring: '#5DCAA5',
  curious: '#7F77DD', neutral: '#BDBDBD',
  lonely: '#EF9F27', sad: '#EF9F27',
  worried: '#D85A30', angry: '#D85A30',
};

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', curious: '🤔', funny: '😂',
  caring: '💛', neutral: '😐', lonely: '😶',
  sad: '😔', worried: '😟', angry: '😤',
};

const MOOD_VALUE: Record<string, number> = {
  excited: 5, happy: 5, funny: 4.5, caring: 4.5, curious: 4,
  neutral: 3, lonely: 2.2, sad: 2, worried: 1.5, angry: 1,
};

const LEGEND = [
  { label: 'Positive',  color: '#5DCAA5', moods: 'happy, excited, funny, caring' },
  { label: 'Curious',   color: '#7F77DD', moods: 'curious' },
  { label: 'Neutral',   color: '#BDBDBD', moods: 'neutral' },
  { label: 'Low',       color: '#EF9F27', moods: 'sad, lonely' },
  { label: 'Distressed',color: '#D85A30', moods: 'worried, angry' },
];

function MoodChart({ data }: { data: MoodDay[] }) {
  if (data.length === 0) return null;
  const W = 560; const H = 110; const PAD = 10;
  const pts = data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - ((MOOD_VALUE[d.mood] ?? 3) - 1) / 4 * (H - PAD * 2),
    color: MOOD_COLOR[d.mood] ?? '#BDBDBD',
    mood: d.mood,
    date: d.date,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-64" style={{ height: 110 }}>
        <defs>
          <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7F77DD" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#7F77DD" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#F0EFF8" strokeWidth="1" />
        <path d={area} fill="url(#mg)" />
        <path d={line} fill="none" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="5" fill={p.color} stroke="white" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-2">
        {data.map((d, i) => (
          <span key={i} className="text-xs text-gray-400" title={d.date}>
            {new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </span>
        )).filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 5) === 0)}
      </div>
    </div>
  );
}

function summaryText(data: MoodDay[]): string {
  if (data.length === 0) return 'No mood data this week.';
  const week = data.slice(-7);
  const avg = week.reduce((s, d) => s + (MOOD_VALUE[d.mood] ?? 3), 0) / week.length;
  if (avg >= 4) return `${week[week.length - 1]?.mood === 'excited' ? '🤩' : '😊'} Your child has been in great spirits lately!`;
  if (avg >= 3) return '😊 Your child seems to be doing well this week.';
  if (avg >= 2) return '😐 Your child has had some mixed feelings recently.';
  return '💛 Your child has been going through a tough patch — consider checking in.';
}

export default function MoodHistory() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [moodHistory, setMoodHistory] = useState<MoodDay[]>([]);
  const [hasCrisisFlag, setCrisisFlag] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    Promise.all([childrenApi.get(childId), parentApi.mood(childId)])
      .then(([cRes, mRes]) => {
        setChildName(cRes.data.child?.name ?? '');
        setMoodHistory(mRes.data.moodHistory ?? []);
        setCrisisFlag(mRes.data.hasCrisisFlag ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  return (
    <div className="min-h-screen bg-bg">
      <ChildNav childId={childId!} childName={childName} active="mood" />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-800 mb-6">Mood History</h1>

        {hasCrisisFlag && (
          <div className="bg-red/10 border border-red/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <span className="text-xl">🚨</span>
            <div>
              <p className="font-semibold text-red text-sm">Crisis flag triggered in the last 7 days</p>
              <p className="text-xs text-red/70 mt-0.5">Our AI detected signs of distress. Check the Alerts tab for details.</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 animate-pulse h-48" />
        ) : moodHistory.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">😶</div>
            <p className="text-gray-400 text-sm">No mood data yet — mood is detected when your child sends messages or posts.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <p className="text-sm text-gray-600 font-medium mb-4">{summaryText(moodHistory)}</p>
              <MoodChart data={moodHistory} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h2 className="text-sm font-bold text-gray-700 mb-3">Legend</h2>
              <div className="flex flex-wrap gap-3">
                {LEGEND.map((l) => (
                  <div key={l.label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="text-xs text-gray-600">{l.label} <span className="text-gray-400">({l.moods})</span></span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Daily breakdown</h2>
              <div className="space-y-2">
                {[...moodHistory].reverse().map((d) => (
                  <div key={d.date} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xl w-8 text-center">{MOOD_EMOJI[d.mood] ?? '😐'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-700 capitalize">{d.mood}</span>
                        <span className="text-xs text-gray-400">{d.note}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.round(d.intensity * 100)}%`, backgroundColor: MOOD_COLOR[d.mood] ?? '#BDBDBD' }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(d.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
