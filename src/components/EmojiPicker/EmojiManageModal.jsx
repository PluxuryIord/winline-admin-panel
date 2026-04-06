import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import './EmojiManageModal.css';

export default function EmojiManageModal({ open, onClose, onChanged }) {
  const [emojis, setEmojis] = useState([]);
  const [newId, setNewId] = useState('');
  const [newFile, setNewFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) loadEmojis();
  }, [open]);

  useEffect(() => {
    if (!newFile) { setPreview(null); return; }
    const url = URL.createObjectURL(newFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newFile]);

  const loadEmojis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emojis');
      if (res.ok) setEmojis(await res.json());
    } catch {
      setError('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438');
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    const id = newId.trim();
    if (!id) { setError('Введите emoji ID'); return; }
    setError('');
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('emoji_id', id);
      if (newFile) formData.append('file', newFile);
      const res = await fetch('/api/emojis', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Ошибка');
        setAdding(false);
        return;
      }
      setNewId('');
      setNewFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadEmojis();
      onChanged?.();
    } catch {
      setError('Ошибка добавления');
    }
    setAdding(false);
  };

  const handleDelete = async (emoji) => {
    try {
      await fetch(`/api/emojis/${emoji.id}`, { method: 'DELETE' });
      await loadEmojis();
      onChanged?.();
    } catch {
      setError('\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f');
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="emoji-manage-backdrop" onClick={onClose} />
      <div className="emoji-manage-modal">
        <div className="emoji-manage-header">
          <span>{'\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u044d\u043c\u043e\u0434\u0437\u0438'}</span>
          <button className="emoji-manage-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="emoji-manage-add-section">
          <div className="emoji-manage-add-row">
            <input
              className="emoji-manage-input"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Telegram emoji ID"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="emoji-manage-add-row">
            <label className="emoji-manage-file-btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              {newFile ? newFile.name : '.webp (необязательно)'}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".webp,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => setNewFile(e.target.files?.[0] || null)}
            />
            {preview && <img src={preview} alt="preview" className="emoji-manage-preview" />}
            <button
              className="emoji-manage-add-btn"
              onClick={handleAdd}
              disabled={adding}
              type="button"
            >
              <Plus size={14} /> {adding ? '...' : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
            </button>
          </div>
        </div>

        {error && <div className="emoji-manage-error">{error}</div>}

        <div className="emoji-manage-grid">
          {loading && <div className="emoji-manage-loading">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>}
          {emojis.map((e) => (
            <div key={e.id} className="emoji-manage-item">
              <img src={e.image_url} alt="emoji" className="emoji-manage-img" />
              <span className="emoji-manage-id">{e.emoji_id}</span>
              <button
                className="emoji-manage-delete"
                onClick={() => handleDelete(e)}
                title={'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}
                type="button"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
