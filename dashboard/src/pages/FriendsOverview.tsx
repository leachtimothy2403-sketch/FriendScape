import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { children as childrenApi, parent as parentApi } from '../services/api';
import ChildNav from '../components/ChildNav';

interface Friend {
  id: string;
  name: string;
  avatar_url: string | null;
  cover_emojis: string | null;
  is_teacher: boolean;
  friendship_level: number;
  friendship_xp: number;
  message_count: number;
  last_active: string | null;
  activated_at: string | null;
}

function LevelBadge({ level }: { level: number }) {
  const labels = ['', 'Acquaintance', 'Friend', 'Good Friend', 'Best Friend', 'BFF'];
  const colors = ['', 'bg-gray-100 text-gray-600', 'bg-blue-50 text-blue-600', 'bg-purple/10 text-purple', 'bg-green-50 text-green-600', 'bg-yellow-50 text-yellow-600'];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[level] ?? colors[1]}`}>
      Lv {level} · {labels[level] ?? 'Friend'}
    </span>
  );
}

function FriendCard({ friend }: { friend: Friend }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-purple/20 hover:shadow-sm transition">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-purple/10 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
          {friend.avatar_url ? (
            <img src={friend.avatar_url} alt={friend.name} className="w-full h-full object-cover rounded-2xl" />
          ) : (
            <span>{(friend.cover_emojis ?? '🤖').charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-gray-800 truncate">{friend.name}</span>
            {friend.is_teacher && (
              <span className="text-xs bg-purple text-white px-2 py-0.5 rounded-full font-semibold">Teacher</span>
            )}
          </div>
          <div className="mb-2">
            <LevelBadge level={friend.friendship_level} />
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>💬 {friend.message_count} messages</span>
            {friend.last_active && (
              <span>🕐 {new Date(friend.last_active).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
            )}
          </div>
          <span className="inline-block mt-2 text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">AI Friend</span>
        </div>
      </div>
    </div>
  );
}

export default function FriendsOverview() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    Promise.all([childrenApi.get(childId), parentApi.friends(childId)])
      .then(([cRes, fRes]) => {
        setChildName(cRes.data.child?.name ?? '');
        setFriends(fRes.data.friends ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  return (
    <div className="min-h-screen bg-bg">
      <ChildNav childId={childId!} childName={childName} active="friends-overview" />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">AI Friends</h1>
          {!loading && <span className="text-sm text-gray-400">{friends.length} friend{friends.length !== 1 ? 's' : ''}</span>}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-28 animate-pulse" />)}
          </div>
        ) : friends.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-gray-400 text-sm">No friends yet — your child hasn't connected with any AI friends.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {friends.map((f) => <FriendCard key={f.id} friend={f} />)}
          </div>
        )}

        <div className="mt-8 bg-purple/5 border border-purple/10 rounded-2xl p-5">
          <p className="text-sm text-purple font-semibold mb-1">About AI Friends</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            All of {childName || 'your child'}'s friends are safe AI characters designed by the Migo team. They are not real people.
            Each friend has a unique personality and interests to help your child practice social skills in a safe environment.
          </p>
        </div>
      </main>
    </div>
  );
}
