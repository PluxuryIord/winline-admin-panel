import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout/Layout.jsx';
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase.jsx';
import Analytics from './pages/Analytics/Analytics.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Users from './pages/Users/Users.jsx';
import UserProfile from './pages/Users/UserProfile.jsx';
import Chats from './pages/Chats/Chats.jsx';
import ChatView from './pages/Chats/ChatView.jsx';
import EventWork from './pages/EventWork/EventWork.jsx';
import Hostess from './pages/Hostess/Hostess.jsx';
import Broadcasts from './pages/Broadcasts/Broadcasts.jsx';
import BroadcastNew from './pages/Broadcasts/BroadcastNew.jsx';
import BroadcastEditor from './pages/Broadcasts/BroadcastEditor.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone страница хостес — без Layout */}
        <Route path="/hostess" element={<Hostess />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/users" replace />} />

          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserProfile />} />
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:id" element={<ChatView />} />
          <Route path="mailings" element={<Broadcasts />} />
          <Route path="mailings/new" element={<BroadcastNew />} />
          <Route path="mailings/editor/:type" element={<BroadcastEditor />} />
          <Route path="scenarios" element={<Placeholder title="Сценарии" />} />

          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="events" element={<EventWork />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;