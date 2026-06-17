import { Link } from 'react-router-dom';

const NAV = [
  { key: 'activity',        label: '📅 Activity', path: 'activity' },
  { key: 'mood',            label: '😊 Mood',     path: 'mood' },
  { key: 'friends-overview',label: '👥 Friends',  path: 'friends-overview' },
  { key: 'badges',          label: '🏅 Badges',   path: 'badges' },
  { key: 'alerts',          label: '🔔 Alerts',   path: 'alerts' },
];

export default function ChildNav({
  childId,
  childName,
  active,
}: {
  childId: string;
  childName: string;
  active: string;
}) {
  return (
    <>
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <Link to="/dashboard" className="text-purple text-sm font-medium hover:underline flex-shrink-0">← Dashboard</Link>
        <span className="text-gray-300 select-none">|</span>
        <Link to={`/children/${childId}`} className="text-sm font-semibold text-gray-700 hover:text-purple transition">{childName}</Link>
      </header>
      <div className="bg-white border-b border-gray-100 px-6 overflow-x-auto">
        <div className="flex gap-1 py-2 min-w-max">
          <Link
            to={`/children/${childId}`}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition text-gray-500 hover:text-purple hover:bg-purple/5"
          >
            Overview
          </Link>
          {NAV.map((item) => (
            <Link
              key={item.key}
              to={`/children/${childId}/${item.path}`}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
                active === item.key
                  ? 'bg-purple text-white'
                  : 'text-gray-500 hover:text-purple hover:bg-purple/5'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
