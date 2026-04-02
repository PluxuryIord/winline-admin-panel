import { useState, useRef } from 'react';
import { Smile, Settings } from 'lucide-react';
import STANDARD_EMOJIS from './standardEmojis.js';
import EmojiManageModal from './EmojiManageModal.jsx';
import './EmojiPicker.css';

export default function EmojiPicker({ onInsert, textareaRef, compact = false, customEmojiIds = [] }) {
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [tab, setTab] = useState('winline');
  const [manageOpen, setManageOpen] = useState(false);
  const cursorPosRef = useRef(null);
  const triggerRef = useRef(null);

  const popupWidth = compact ? 220 : 280;

  const handleOpen = () => {
    if (textareaRef?.current) {
      cursorPosRef.current = textareaRef.current.selectionStart;
    }
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;

      let left;
      if (spaceRight >= popupWidth + 8) {
        left = rect.right + 4;
      } else if (spaceLeft >= popupWidth + 8) {
        left = rect.left - popupWidth - 4;
      } else {
        left = Math.max(8, rect.right - popupWidth);
      }

      setPopupPos({
        top: rect.top - 8,
        left,
      });
    }
    setOpen(!open);
  };

  const handleSelectCustom = (emojiId) => {
    const tag = `<tg-emoji emoji-id="${emojiId}">\u2B50</tg-emoji>`;
    onInsert(tag, cursorPosRef.current);
    setOpen(false);
  };

  const handleSelectStandard = (emoji) => {
    onInsert(emoji, cursorPosRef.current);
    setOpen(false);
  };

  return (
    <div className="emoji-picker-wrapper">
      <button
        ref={triggerRef}
        className="emoji-picker-trigger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleOpen}
        title={'\u042D\u043C\u043E\u0434\u0437\u0438'}
        type="button"
      >
        <Smile size={16} />
      </button>

      {open && (
        <>
          <div className="emoji-picker-backdrop" onClick={() => setOpen(false)} />
          <div
            className={`emoji-picker-popup ${compact ? 'emoji-picker-popup--compact' : ''}`}
            style={{
              position: 'fixed',
              top: popupPos.top,
              left: popupPos.left,
              transform: 'translateY(-100%)',
              width: popupWidth,
            }}
          >
            <div className="emoji-picker-tabs">
              <button
                className={`emoji-picker-tab ${tab === 'winline' ? 'emoji-picker-tab--active' : ''}`}
                onClick={() => setTab('winline')}
                type="button"
              >
                Winline
              </button>
              <button
                className={`emoji-picker-tab ${tab === 'standard' ? 'emoji-picker-tab--active' : ''}`}
                onClick={() => setTab('standard')}
                type="button"
              >
                {'\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435'}
              </button>
              <button
                className="emoji-picker-tab emoji-picker-tab--gear"
                onClick={() => { setOpen(false); setManageOpen(true); }}
                title={'\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u044D\u043C\u043E\u0434\u0437\u0438'}
                type="button"
              >
                <Settings size={13} />
              </button>
            </div>

            {tab === 'winline' && (
              <div className="emoji-picker-grid">
                {customEmojiIds.map((id) => (
                  <button
                    key={id}
                    className="emoji-picker-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectCustom(id)}
                    title={id}
                  >
                    <img
                      src={`/emoji/${id}.webp`}
                      alt="emoji"
                      className="emoji-picker-img"
                      loading="lazy"
                    />
                  </button>
                ))}
                {customEmojiIds.length === 0 && (
                  <div className="emoji-picker-empty">{'\u041D\u0435\u0442 \u044D\u043C\u043E\u0434\u0437\u0438'}</div>
                )}
              </div>
            )}

            {tab === 'standard' && (
              <div className="emoji-picker-standard">
                {STANDARD_EMOJIS.map((cat) => (
                  <div key={cat.name}>
                    <div className="emoji-picker-cat-label">{cat.name}</div>
                    <div className="emoji-picker-grid">
                      {cat.emojis.map((em) => (
                        <button
                          key={em}
                          className="emoji-picker-item emoji-picker-item--unicode"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectStandard(em)}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <EmojiManageModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
