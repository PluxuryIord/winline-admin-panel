import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import { Loader } from 'lucide-react';

import Layout from './components/Layout/Layout.jsx';
import { UnreadProvider } from './contexts/UnreadContext.jsx';
import Login from './pages/Auth/Login.jsx';
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase.jsx';
import Analytics from './pages/Analytics/Analytics.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Users from './pages/Users/Users.jsx';
import UserProfile from './pages/Users/UserProfile.jsx';
import Chats from './pages/Chats/Chats.jsx';
import ChatView from './pages/Chats/ChatView.jsx';
import EventWork from './pages/EventWork/EventWork.jsx';
import RaffleV2 from './pages/RaffleV2/RaffleV2.jsx';
import BotScenarios from './pages/Scenarios/BotScenarios.jsx';
import AdminUsers from './pages/AdminUsers/AdminUsers.jsx';
import AuditLog from './pages/AuditLog/AuditLog.jsx';
import VersionHistory from './pages/VersionHistory/VersionHistory.jsx';

import Broadcasts from './pages/Broadcasts/Broadcasts.jsx';
import BroadcastNew from './pages/Broadcasts/BroadcastNew.jsx';
import BroadcastEditor from './pages/Broadcasts/BroadcastEditor.jsx';
import Alarms from './pages/Alarms/Alarms.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a12' }}>
        <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: '#FF7E00' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}


function App() {
  return (
      <Routes>
        {/* Публичные страницы */}
        <Route path="/login" element={<Login />} />

        {/* Защищённые страницы */}
        <Route path="/" element={<ProtectedRoute><UnreadProvider><Layout /></UnreadProvider></ProtectedRoute>}>
          <Route index element={<Navigate to="/users" replace />} />

          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserProfile />} />
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:id" element={<ChatView />} />
          <Route path="mailings" element={<Broadcasts />} />
          <Route path="mailings/new" element={<BroadcastNew />} />
          <Route path="mailings/editor/:type" element={<BroadcastEditor />} />
          <Route path="scenarios" element={<BotScenarios />} />

          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="events" element={<EventWork />} />
          <Route path="raffles" element={<RaffleV2 />} />
          <Route path="alarms" element={<Alarms />} />
          <Route path="admin-users" element={<AdminUsers />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="version-history" element={<VersionHistory />} />
        </Route>
      </Routes>
  );
}

export default App;
