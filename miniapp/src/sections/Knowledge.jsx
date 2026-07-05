import { useState, useEffect } from 'react';
import { Loader, ChevronRight, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { tgHtml } from '../lib/html.js';

function photoSrc(a) {
  return a.photoS3Url || (a.photoFileId ? `/api/knowledge/photo/${a.photoFileId}` : null);
}

function Article({ article, onOpenSub }) {
  const src = photoSrc(article);
  return (
    <div>
      {src && <img className="kb-photo" src={src} alt="" loading="lazy" />}
      <div className="card tg-text" dangerouslySetInnerHTML={{ __html: tgHtml(article.content) }} />
      {article.subtopics?.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {article.subtopics.map((s) => (
            <button key={s.fullKey} className="kb-row" onClick={() => onOpenSub(s)}>
              <span>{s.title}</span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// KB browser: topic list → article (+photo) → subtopic. Local mini-stack so
// the Telegram BackButton still pops the app-level section stack only once.
export default function Knowledge() {
  const [articles, setArticles] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);      // article
  const [sub, setSub] = useState(null);        // subtopic of `open`

  useEffect(() => {
    let alive = true;
    api.get('/content/kb').then((res) => {
      if (!alive) return;
      if (res.ok) setArticles(res.data.articles || []);
      else setErr(res.data?.error === 'not_authorized' ? 'Войдите, чтобы открыть базу знаний' : 'Не удалось загрузить');
    });
    return () => { alive = false; };
  }, []);

  if (err) return <p className="dim">{err}</p>;
  if (!articles) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader className="spin" /></div>;

  if (sub) {
    return (
      <div>
        <button className="kb-back" onClick={() => setSub(null)}><ArrowLeft size={16} /> {open?.title}</button>
        <h2 className="section-title">{sub.title}</h2>
        {photoSrc(sub) && <img className="kb-photo" src={photoSrc(sub)} alt="" loading="lazy" />}
        <div className="card tg-text" dangerouslySetInnerHTML={{ __html: tgHtml(sub.content) }} />
      </div>
    );
  }

  if (open) {
    return (
      <div>
        <button className="kb-back" onClick={() => setOpen(null)}><ArrowLeft size={16} /> База знаний</button>
        <h2 className="section-title">{open.title}</h2>
        <Article article={open} onOpenSub={setSub} />
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">База знаний</h2>
      {articles.length === 0 && <p className="dim">Пока пусто.</p>}
      {articles.map((a) => (
        <button key={a.key} className="kb-row" onClick={() => setOpen(a)}>
          <span>{a.title}</span>
          <ChevronRight size={17} />
        </button>
      ))}
    </div>
  );
}
