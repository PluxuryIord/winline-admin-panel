import { useState, useRef, useEffect, useCallback } from 'react';
import './Hostess.css';

// Есть ли BarcodeDetector в браузере (Chrome/Edge Android + Desktop)
const hasBarcodeDetector = () => typeof window !== 'undefined' && 'BarcodeDetector' in window;

// Мобильное устройство
const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default function Hostess() {
  const [inputValue, setInputValue]   = useState('');
  const [result, setResult]           = useState(null); // null | { id, status: 'give'|'already' }
  const [scannedCount, setScannedCount] = useState(0);
  const [cameraError, setCameraError] = useState(null); // null | string
  const [scanning, setScanning]       = useState(false); // камера активна

  const givenIds      = useRef(new Set());
  const inputRef      = useRef(null);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const detectorRef   = useRef(null);
  const rafRef        = useRef(null);
  const isMobile      = isMobileDevice();

  /* ---------- Логика сканирования ---------- */
  const handleScan = useCallback((rawId) => {
    const id = String(rawId).trim();
    if (!id) return;
    stopCamera();
    const status = givenIds.current.has(id) ? 'already' : 'give';
    setResult({ id, status });
    setInputValue('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (result?.status === 'give') givenIds.current.add(result.id);
    setScannedCount(prev => prev + 1);
    setResult(null);
  };

  /* ---------- Камера + BarcodeDetector ---------- */
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const scanLoop = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes.length > 0) { handleScan(codes[0].rawValue); return; }
    } catch (_) {}
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleScan]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (hasBarcodeDetector()) {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        setScanning(true);
        rafRef.current = requestAnimationFrame(scanLoop);
      } else {
        setScanning(true); // камера есть, но декодера нет — только картинка
      }
    } catch (e) {
      setCameraError('Нет доступа к камере. Разрешите использование в настройках браузера.');
    }
  }, [scanLoop]);

  /* ---------- Запуск камеры на мобиле при отсутствии результата ---------- */
  useEffect(() => {
    if (isMobile && !result) {
      startCamera();
    }
    return () => { if (isMobile) stopCamera(); };
  }, [isMobile, result]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Автофокус текстового поля на десктопе ---------- */
  useEffect(() => {
    if (!isMobile && !result) inputRef.current?.focus();
  }, [isMobile, result]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan(inputValue);
  };

  /* ---------- Render ---------- */
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
          isMobile ? (
            /* === МОБИЛЬ: Камера === */
            <div className="hostess-camera-wrap">
              {cameraError ? (
                <div className="hostess-camera-error">{cameraError}</div>
              ) : (
                <video
                  ref={videoRef}
                  className="hostess-camera-video"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              {/* На случай если BarcodeDetector недоступен — ручной ввод */}
              {scanning && !hasBarcodeDetector() && (
                <input
                  ref={inputRef}
                  className="hostess-scan-input hostess-scan-input--overlay"
                  placeholder="Введите код вручную"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
              )}
            </div>
          ) : (
            /* === ДЕСКТОП: Текстовое поле === */
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
          )
        ) : (
          /* === Карточка результата === */
          <div className={`hostess-result-card ${result.status === 'give' ? 'give' : 'already'}`}>
            <div className="hostess-result-id">Гость с ID<br />{result.id}</div>
            <div className="hostess-result-action">
              {result.status === 'give' ? 'Выдайте гостю приз' : 'Гость уже получил приз'}
            </div>
            <button className="hostess-next-btn" onClick={handleNext}>Далее</button>
          </div>
        )}

      </div>

      {/* Нижняя панель */}
      <div className="hostess-footer">
        <span>Отсканировано кодов: {scannedCount}</span>
        <a
          href="https://t.me/winlinepartners"
          target="_blank"
          rel="noopener noreferrer"
          className="hostess-support-link"
        >
          Техническая поддержка
        </a>
      </div>

    </div>
  );
}
