import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Placeholder from './pages/Placeholder';
import KnowledgeBase from './pages/KnowledgeBase'; // Импортируем нашу Вики

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/users" replace />} />
          
          {/* Пока оставляем заглушки для остальных */}
          <Route path="users" element={<Placeholder title="Пользователи" />} />
          <Route path="chats" element={<Placeholder title="Чаты" />} />
          <Route path="mailings" element={<Placeholder title="Рассылки и контент" />} />
          <Route path="scenarios" element={<Placeholder title="Сценарии" />} />
          
          {/* Подключаем Базу знаний */}
          <Route path="knowledge" element={<KnowledgeBase />} />
          
          <Route path="analytics" element={<Placeholder title="Аналитика" />} />
          <Route path="events" element={<Placeholder title="Работа на ивенте" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;