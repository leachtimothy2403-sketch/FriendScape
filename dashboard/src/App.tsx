import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChildDetail from './pages/ChildDetail';
import FriendManagement from './pages/FriendManagement';
import Settings from './pages/Settings';
import ActivityTimeline from './pages/ActivityTimeline';
import MoodHistory from './pages/MoodHistory';
import FriendsOverview from './pages/FriendsOverview';
import BadgeProgress from './pages/BadgeProgress';
import ParentAlerts from './pages/ParentAlerts';

function isLoggedIn() {
  return !!localStorage.getItem('parentToken');
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={<PrivateRoute><Dashboard /></PrivateRoute>}
        />
        <Route
          path="/children/:childId"
          element={<PrivateRoute><ChildDetail /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/friends"
          element={<PrivateRoute><FriendManagement /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/activity"
          element={<PrivateRoute><ActivityTimeline /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/mood"
          element={<PrivateRoute><MoodHistory /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/friends-overview"
          element={<PrivateRoute><FriendsOverview /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/badges"
          element={<PrivateRoute><BadgeProgress /></PrivateRoute>}
        />
        <Route
          path="/children/:childId/alerts"
          element={<PrivateRoute><ParentAlerts /></PrivateRoute>}
        />
        <Route
          path="/settings"
          element={<PrivateRoute><Settings /></PrivateRoute>}
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
