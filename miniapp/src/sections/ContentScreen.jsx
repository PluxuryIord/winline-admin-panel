import { useState, useEffect } from 'react';
import { Loader, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { tgHtml } from '../lib/html.js';
import { openLink, openTelegramLink, handleHtmlLinkClick } from '../lib/telegram.js';

// Generic renderer for a bot scenario screen (offer_page / promo_page /
// socials_page): sanitized Telegram-HTML texts + its url-buttons.
export default function ContentScreen({ screenId, fallbackTitle }) {
  const [screen, setScreen] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/content/screen/${screenId}`).then((res) => {
      if (!alive) return;
      if (res.ok) setScreen(res.data);
      else setErr(res.data?.error === 'not_authorized' ? 'Войдите, чтобы открыть раздел' : 'Не удалось загрузить');
    });
    return () => { alive = false; };
  }, [screenId]);

  if (err) return <p className="dim">{err}</p>;
  if (!screen) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader className="spin" /></div>;

  return (
    <div>
      <h2 className="section-title">{screen.title || fallbackTitle}</h2>
      {screen.messages.map((m) => (
        // onClick перехватывает тап по <a> внутри текста → внешний браузер,
        // иначе сырой <a> увёл бы вебвью внутри мини-аппки.
        <div
          key={m.key}
          className="card tg-text"
          onClick={handleHtmlLinkClick}
          dangerouslySetInnerHTML={{ __html: tgHtml(m.text) }}
        />
      ))}
      {screen.buttons.map((b) => (
        <button
          key={b.key}
          className="btn btn-primary"
          style={{ marginBottom: 8 }}
          onClick={() => (b.url.startsWith('https://t.me/') ? openTelegramLink(b.url) : openLink(b.url))}
        >
          {b.label} <ExternalLink size={15} />
        </button>
      ))}
    </div>
  );
}
