import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { friends as friendsApi, children as childrenApi } from '../services/api';

interface AIFriend {
  id: string;
  name: string;
  bio: string;
  personality: string[];
  isStarFriend: boolean;
  isTeacher: boolean;
}

export default function FriendManagement() {
  const { childId } = useParams<{ childId: string }>();
  const [childName, setChildName] = useState('');
  const [allFriends, setAllFriends] = useState<AIFriend[]>([]);
  const [activeFriendIds, setActiveFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    Promise.all([
      friendsApi.list(),
      friendsApi.getForChild(childId),
      childrenApi.get(childId),
    ]).then(([allRes, activeRes, childRes]) => {
      setAllFriends(allRes.data.friends);
      setActiveFriendIds(new Set(activeRes.data.friends.map((f: AIFriend) => f.id)));
      setChildName(childRes.data.child.name);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [childId]);

  async function toggle(friendId: string, currentlyActive: boolean) {
    if (!childId) return;
    setSaving(friendId);
    try {
      if (currentlyActive) {
        await friendsApi.deactivate(childId, friendId);
        setActiveFriendIds((prev) => { const s = new Set(prev); s.delete(friendId); return s; });
      } else {
        await friendsApi.activate(childId, friendId);
        setActiveFriendIds((prev) => new Set([...prev, friendId]));
      }
    } catch {
      // handle error
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="min-h-screen bg-bg flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <Link to={`/children/${childId}`} className="text-purple text-sm font-medium hover:underline">
          ← {childName}'s Profile
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Friend Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Choose which AI friends {childName} can chat with. You're always in control.
          </p>
        </div>

        {allFriends.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            No AI friends available yet. Check back soon!
          </div>
        ) : (
          <div className="space-y-4">
            {allFriends.map((friend) => {
              const isActive = activeFriendIds.has(friend.id);
              const isSaving = saving === friend.id;
              return (
                <div key={friend.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple/10 flex items-center justify-center text-2xl shrink-0">
                    🌟
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-800">{friend.name}</span>
                      {friend.isStarFriend && (
                        <span className="text-xs bg-orange/10 text-orange px-2 py-0.5 rounded-full font-medium">⭐ Star</span>
                      )}
                      {friend.isTeacher && (
                        <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded-full font-medium">🎓 Teacher</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 truncate">{friend.bio}</p>
                  </div>
                  <button
                    onClick={() => toggle(friend.id, isActive)}
                    disabled={isSaving}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      isActive
                        ? 'bg-red/10 text-red hover:bg-red/20'
                        : 'bg-purple text-white hover:bg-purple/90'
                    } disabled:opacity-50`}
                  >
                    {isSaving ? '…' : isActive ? 'Remove' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
