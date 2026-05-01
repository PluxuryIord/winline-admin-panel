import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus, X, Loader } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import './AdminUsers.css';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'editor' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/api/admin-users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ username: '', displayName: '', password: '', role: 'editor' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({ username: u.username, displayName: u.display_name || '', password: '', role: u.role });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editingUser) {
        const body = { displayName: form.displayName, role: form.role };
        if (form.password) body.password = form.password;
        const res = await api.put(`/api/admin-users/${editingUser.id}`, body);
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Ошибка');
        }
      } else {
        const res = await api.post('/api/admin-users', {
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Ошибка');
        }
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await api.delete(`/api/admin-users/${id}`);
      setConfirmDelete(null);
      fetchUsers();
    } catch {
      // ignore
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="admin-users-container">
        <div className="admin-users-loading"><Loader size={24} className="spin" /></div>
      </div>
    );
  }

  return (
    <div className="admin-users-container">
      <div className="admin-users-header">
        <h1>Управление пользователями</h1>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> Создать пользователя
        </button>
      </div>

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Создан</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.filter((u) => u.username !== 'WinlineAdmin').map((u) => (
              <tr key={u.id}>
                <td>{u.display_name || '—'}</td>
                <td>{u.username}</td>
                <td>
                  <span className={`role-badge role-${u.role}`}>
                    {u.role === 'admin' ? 'Админ' : 'Редактор'}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${u.is_active !== false ? 'active' : 'inactive'}`}>
                    {u.is_active !== false ? 'Активен' : 'Неактивен'}
                  </span>
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td className="actions-cell">
                  <button className="icon-btn" onClick={() => openEdit(u)} title="Редактировать">
                    <Pencil size={15} />
                  </button>
                  {u.id !== currentUser?.id && (
                    <button className="icon-btn danger" onClick={() => setConfirmDelete(u)} title="Удалить">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="empty-row">Нет пользователей</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Редактирование' : 'Создание пользователя'}</h2>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="modal-error">{error}</div>}
              {!editingUser && (
                <label className="field">
                  <span>Логин</span>
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="username"
                  />
                </label>
              )}
              <label className="field">
                <span>Отображаемое имя</span>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Имя Фамилия"
                />
              </label>
              <label className="field">
                <span>{editingUser ? 'Новый пароль (оставьте пустым)' : 'Пароль'}</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingUser ? 'Не менять' : 'Пароль'}
                />
              </label>
              <label className="field">
                <span>Роль</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">Админ</option>
                  <option value="editor">Редактор</option>
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>Отмена</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm deactivate modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Удаление</h2>
              <button className="icon-btn" onClick={() => setConfirmDelete(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>Вы уверены, что хотите удалить пользователя <strong>{confirmDelete.display_name || confirmDelete.username}</strong>? Это действие необратимо.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Отмена</button>
              <button className="btn-danger" onClick={() => handleDeactivate(confirmDelete.id)}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
