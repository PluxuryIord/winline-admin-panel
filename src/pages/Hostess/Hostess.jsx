import { useState, useRef, useEffect } from 'react';
import './Hostess.css';

export default function Hostess() {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState(null); // null | { id, status: 'give' | 'already' }
  const [scannedCount, setScannedCount] = useState(0);
  const givenIds = useRef(new Set());
  const inputRef = useRef(null);

  // Автофокус при загрузке и после сброса
  useEffect(() => {
    if (!result) {
      inputRef.current?.focus();
    }
  }, [result]);

  const handleScan = (value) => {
    const id = value.trim();
    if (!id) return;

    const status = givenIds.current.has(id) ? 'already' : 'give';
    setResult({ id, status });
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleScan(inputValue);
    }
  };

  const handleNext = () => {
    if (result?.status === 'give') {
      givenIds.current.add(result.id);
    }
    setScannedCount(prev => prev + 1);
    setResult(null);
  };

  return (
    <div className="hostess-page">

      {/* Логотип */}
      <div className="hostess-logo-wrap">
        <div className="hostess-logo-badge">
          <span className="hostess-logo-text">Winline</span>
          <span className="hostess-logo-circle" />
        </div>
        <div className="hostess-logo-subtitle">PARTNERS</div>
      </div>

      {/* Центральный блок */}
      <div className="hostess-center">
        {!result ? (
          <input
            ref={inputRef}
            className="hostess-scan-input"
            placeholder="Отсканируйте QR код"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <div className={`hostess-result-card ${result.status === 'give' ? 'give' : 'already'}`}>
            <div className="hostess-result-id">Гость с ID {result.id}</div>
            <div className="hostess-result-action">
              {result.status === 'give' ? 'Выдайте гостю приз' : 'Гость уже получил приз'}
            </div>
            <button className="hostess-next-btn" onClick={handleNext}>
              Далее
            </button>
          </div>
        )}
      </div>

      {/* Нижняя панель */}
      <div className="hostess-footer">
        <span>Отсканировано кодов: {scannedCount}</span>
        <a href="https://t.me/winlinepartners" target="_blank" rel="noopener noreferrer" className="hostess-support-link">
          Техническая поддержка
        </a>
      </div>

    </div>
  );
}
