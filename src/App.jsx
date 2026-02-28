import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout/Layout.jsx'; 
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase.jsx';
import Analytics from './pages/Analytics/Analytics.jsx';
import Placeholder from './pages/Placeholder.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/users" replace />} />
          
          <Route path="users" element={<Placeholder title="Пользователи" />} />
          <Route path="chats" element={<Placeholder title="Чаты" />} />
          <Route path="mailings" element={<Placeholder title="Рассылки и контент" />} />
          <Route path="scenarios" element={<Placeholder title="Сценарии" />} />
          
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="events" element={<Placeholder title="Работа на ивенте" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;