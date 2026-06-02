import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';

interface Child {
  id: string;
  name: string;
  age: number;
  gender: string;
  language: string;
  special_needs: string[];
  pre_reader: boolean;
  mascot: string;
  interests: string[];
  selected_pack: string;
}

interface Post {
  id: string;
  content: string;
  mood: string | null;
  author_type: 'child' | 'ai';
  friend_name: string | null;
  created_at: string;
}

interface Message {
  id: string;
  sender_type: 'child' | 'ai';
  content: string;
  friend_name: string | null;
  created_at: string;
}

interface Stats {
  totalPosts: number;
  totalMessages: number;
  topMoodThisWeek: string;
  messagesToday: number;
  screenTimeToday: number;
  screenTimeWeeklyAvg: number;
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', curious: '🤔', funny: '😂',
  caring: '💛', sad: '😔', worried: '😟', angry: '😤', lonely: '😶', neutral: '😐',
};

// happy=green, sad=orange, worried=red, neutral=grey
const MOOD_BORDER: Record<string, string> = {
  happy: '#5DCAA5', excited: '#5DCAA5', funny: '#5DCAA5', caring: '#5DCAA5',
  sad: '#EF9F27', lonely: '#EF9F27',
  worried: '#D85A30', angry: '#D85A30',
  neutral: '#BDBDBD', curious: '#BDBDBD',
};

const MASCOT_EMOJI: Record<string, string> = {
  miga: '🧚', pixel: '🤖', finn: '🦊', sage: '🦉',
  luna: '🦉', cosmo: '🚀', pip: '🐸', sunny: '🌻',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ChildDetail() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild]     = useState<Child | null>(null);
  const [posts, setPosts]     = useState<Post[]>([]);
  const [messages, setMsgs]   = useState<Message[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [tab, setTab]         = useState<'posts' | 'messages'>('posts');
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    setError(false);
    Promise.all([
      childrenApi.get(childId),
      parentApi.childPosts(childId),
      parentApi.childMessages(childId),
      parentApi.childStats(childId),
    ])
      .then(([childRes, postsRes, msgsRes, statsRes]) => {
        setChild(childRes.data.child);
        setPosts(postsRes.data.posts ?? []);
        setMsgs(msgsRes.data.messages ?? []);
        setStats(statsRes.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [childId, fetchKey]);

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">🌈</div>
        <p className="text-gray-400 text-sm">Loading activity…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
      <div className="text-5xl mb-2">😕</div>
      <p className="text-gray-600 font-medium">Something went wrong loading this child's data.</p>
      <button
        onClick={() => setFetchKey((k) => k + 1)}
        className="bg-purple text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-purple/90 transition"
      >
        Retry
      </button>
      <Link to="/dashboard" className="text-sm text-gray-400 hover:text-purple transition">← Back to dashboard</Link>
    </div>
  );

  if (!child) return (
    <div className="min-h-screen bg-bg flex items-center justify-center text-gray-400">Child not found.</div>
  );

  const mascotEmoji = MASCOT_EMOJI[child.mascot] || '😊';

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <Link to="/dashboard" className="text-purple text-sm font-medium hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">

        {/* Child header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-purple/10 flex items-center justify-center text-4xl">
            {mascotEmoji}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">{child.name}</h1>
            <p className="text-gray-400 text-sm mt-1">
              Age {child.age} · {child.selected_pack || 'Explorer'} Pack · {child.language?.toUpperCase()}
              {child.pre_reader && ' · Pre-reader mode on'}
            </p>
            {child.interests?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {child.interests.map((i) => (
                  <span key={i} className="bg-purple/10 text-purple text-xs px-3 py-1 rounded-full font-medium capitalize">{i}</span>
                ))}
              </div>
            )}
          </div>
          <Link
            to={`/children/${childId}/friends`}
            className="bg-purple text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-purple/90 transition"
          >
            Manage Friends
          </Link>
        </div>

        {/* Stats row */}
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard emoji="📝" value={String(stats.totalPosts)}    label="Total posts" />
            <StatCard emoji="💬" value={String(stats.totalMessages)} label="Total messages" />
            <StatCard emoji={MOOD_EMOJI[stats.topMoodThisWeek] ?? '😐'} value={stats.topMoodThisWeek} label="Mood this week" />
            <StatCard emoji="⏱️" value={`${stats.screenTimeToday}m`} label="Screen time today" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-20 animate-pulse" />
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-2 mb-4">
          {(['posts', 'messages'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === t ? 'bg-purple text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-purple/40'}`}
            >
              {t === 'posts' ? `📝 Posts (${posts.length})` : `💬 Messages (${messages.length})`}
            </button>
          ))}
        </div>

        {/* Posts tab */}
        {tab === 'posts' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            {posts.length === 0 ? (
              <p className="text-gray-400 text-sm">{child.name} hasn't posted yet.</p>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="border border-gray-100 rounded-xl p-4"
                    style={post.mood ? { borderLeft: `4px solid ${MOOD_BORDER[post.mood] ?? '#BDBDBD'}` } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${post.author_type === 'child' ? 'bg-green/10 text-green-700' : 'bg-purple/10 text-purple'}`}>
                        {post.author_type === 'child' ? child.name : post.friend_name ?? 'AI'}
                      </span>
                      {post.mood && <span className="text-sm">{MOOD_EMOJI[post.mood] ?? ''}</span>}
                    </div>
                    <p className="text-sm text-gray-700">{post.content}</p>
                    <p className="text-xs text-gray-400 mt-2">{fmt(post.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages tab */}
        {tab === 'messages' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-sm">{child.name} hasn't messaged anyone yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.sender_type === 'child' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${msg.sender_type === 'child' ? 'bg-purple text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                      {msg.sender_type === 'ai' && (
                        <p className="text-xs font-semibold mb-1 opacity-60">{msg.friend_name ?? 'AI'}</p>
                      )}
                      {msg.content}
                      <p className={`text-xs mt-1 ${msg.sender_type === 'child' ? 'text-white/60' : 'text-gray-400'}`}>
                        {fmt(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

function StatCard({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-3">
      <span className="text-2xl">{emoji}</span>
      <div>
        <p className="text-lg font-bold text-gray-800 capitalize">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
