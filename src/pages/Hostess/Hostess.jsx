import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import './Hostess.css';

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Логика статуса: 1/11/111... → выдать приз, 2/22/222... → уже получил
// Для реальных ID: первый скан → выдать, повторный → уже получил
const getScanStatus = (id, givenIds) => {
  if (/^1+$/.test(id)) return 'give';
  if (/^2+$/.test(id)) return 'already';
  return givenIds.has(id) ? 'already' : 'give';
};

export default function Hostess() {
  const [inputValue, setInputValue]     = useState('');
  const [result, setResult]             = useState(null); // null | { id, status }
  const [scannedCount, setScannedCount] = useState(0);
  const [cameraError, setCameraError]   = useState(null);
  const [scanning, setScanning]         = useState(false);

  const givenIds  = useRef(new Set());
  const inputRef  = useRef(null);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const isMobile  = isMobileDevice();

  /* ─── Завершить сканирование ─── */
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  /* ─── Обработка результата сканирования ─── */
  const handleScan = useCallback((rawId) => {
    const id = String(rawId).trim();
    if (!id) return;
    stopCamera();
    const status = getScanStatus(id, givenIds.current);
    setResult({ id, status });
    setInputValue('');
  }, [stopCamera]);

  /* ─── jsQR: читаем фреймы с видео через canvas ─── */
  const scanLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) { rafRef.current = requestAnimationFrame(scanLoop); return; }

    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code) { handleScan(code.data); return; }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleScan]);

  /* ─── Запуск камеры ─── */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setCameraError('Нет доступа к камере. Разрешите использование в настройках браузера.');
    }
  }, [scanLoop]);

  /* ─── Автостарт камеры на мобиле ─── */
  useEffect(() => {
    if (isMobile && !result) startCamera();
    return () => { if (isMobile) stopCamera(); };
  }, [isMobile, result]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Автофокус на десктопе ─── */
  useEffect(() => {
    if (!isMobile && !result) inputRef.current?.focus();
  }, [isMobile, result]);

  /* ─── Клавиатурный ввод (десктоп) ─── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan(inputValue);
  };

  /* ─── «Далее» ─── */
  const handleNext = () => {
    if (result?.status === 'give' && !/^[12]+$/.test(result.id)) {
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

      {/* Центральная зона */}
      <div className="hostess-center">
        {!result ? (
          isMobile ? (
            /* === МОБИЛЬ: живая камера === */
            <div className="hostess-camera-wrap">
              {cameraError ? (
                <div className="hostess-camera-error">{cameraError}</div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="hostess-camera-video"
                    autoPlay playsInline muted
                  />
                  {/* скрытый canvas для jsQR */}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </>
              )}
            </div>
          ) : (
            /* === ДЕСКТОП: текстовый ввод === */
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
          href="https://t.me/avoynich"
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
