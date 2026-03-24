import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import './Hostess.css';

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const API_BASE = window.location.origin;

async function serverScan(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/events/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[hostess] Server scan failed:', e.message);
    return null;
  }
}

export default function Hostess() {
  const [inputValue, setInputValue]     = useState('');
  const [result, setResult]             = useState(null); // null | { id, status, userName, scanCount, message }
  const [scannedCount, setScannedCount] = useState(0);
  const [cameraError, setCameraError]   = useState(null);
  const [scanning, setScanning]         = useState(false);
  const [processing, setProcessing]     = useState(false);
  const [stats, setStats]               = useState(null);

  // Fetch stats on mount and after each scan
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events/public-stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const givenIds  = useRef(new Set()); // fallback for offline mode
  const inputRef  = useRef(null);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const isMobile  = isMobileDevice();

  /* ─── Stop camera ─── */
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  /* ─── Handle scan result ─── */
  const handleScan = useCallback(async (rawId) => {
    const id = String(rawId).trim();
    if (!id || processing) return;

    stopCamera();
    setProcessing(true);

    // Try server first
    const serverResult = await serverScan(id);

    if (serverResult) {
      // Server responded
      setResult({
        id,
        status: serverResult.status, // 'give' | 'already' | 'not_found'
        userName: serverResult.user_name || null,
        scanCount: serverResult.scan_count || 0,
        message: serverResult.message || '',
      });
    } else {
      // Fallback: local mode
      const status = givenIds.current.has(id) ? 'already' : 'give';
      setResult({
        id,
        status,
        userName: null,
        scanCount: 0,
        message: status === 'give' ? 'Выдайте гостю приз' : 'Гость уже получил приз',
      });
    }

    setInputValue('');
    setProcessing(false);
  }, [stopCamera, processing]);

  /* ─── jsQR scan loop ─── */
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
        inversionAttempts: 'attemptBoth',
      });
      if (code) { handleScan(code.data); return; }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleScan]);

  /* ─── Start camera ─── */
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

  /* ─── Auto-start camera on mobile ─── */
  useEffect(() => {
    if (isMobile && !result && !processing) startCamera();
    return () => { if (isMobile) stopCamera(); };
  }, [isMobile, result, processing]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Auto-focus on desktop ─── */
  useEffect(() => {
    if (!isMobile && !result && !processing) inputRef.current?.focus();
  }, [isMobile, result, processing]);

  /* ─── Keyboard input (desktop) ─── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan(inputValue);
  };

  /* ─── Next button ─── */
  const handleNext = () => {
    if (result?.status === 'give') {
      givenIds.current.add(result.id);
    }
    setScannedCount(prev => prev + 1);
    setResult(null);
    fetchStats(); // refresh stats
  };

  /* ─── Result card styling ─── */
  const getCardClass = () => {
    if (!result) return '';
    if (result.status === 'give') return 'give';
    if (result.status === 'not_found') return 'not-found';
    return 'already';
  };

  const getResultText = () => {
    if (!result) return '';
    if (result.message) return result.message;
    if (result.status === 'give') return 'Выдайте гостю приз';
    if (result.status === 'not_found') return 'Пользователь не найден';
    return 'Гость уже получил приз';
  };

  return (
    <div className="hostess-page">

      {/* Logo */}
      <div className="hostess-logo-wrap">
        <img src="/logo.svg" alt="Winline Partners" className="hostess-logo-img" />
      </div>

      {/* Mini stats */}
      {stats && (
        <div className="hostess-stats">
          <div className="hostess-stat">
            <span className="hostess-stat-value">{stats.totalCodes}</span>
            <span className="hostess-stat-label">Выдано</span>
          </div>
          <div className="hostess-stat-divider" />
          <div className="hostess-stat">
            <span className="hostess-stat-value">{stats.usedCodes}</span>
            <span className="hostess-stat-label">Активировано</span>
          </div>
          {stats.codeLimit > 0 && (
            <>
              <div className="hostess-stat-divider" />
              <div className="hostess-stat">
                <span className="hostess-stat-value">{stats.codeLimit}</span>
                <span className="hostess-stat-label">Лимит</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Center zone */}
      <div className="hostess-center">
        {processing ? (
          <div className="hostess-processing">Проверка...</div>
        ) : !result ? (
          isMobile ? (
            /* === MOBILE: live camera === */
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
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </>
              )}
            </div>
          ) : (
            /* === DESKTOP: text input === */
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
          /* === Result card === */
          <div className={`hostess-result-card ${getCardClass()}`}>
            {result.userName ? (
              <div className="hostess-result-id">
                {result.userName}
                <span className="hostess-result-subid">ID {result.id}</span>
              </div>
            ) : (
              <div className="hostess-result-id">Гость с ID<br />{result.id}</div>
            )}
            <div className="hostess-result-action">{getResultText()}</div>
            {result.scanCount > 0 && (
              <div className="hostess-result-scan-count">
                Сканирований: {result.scanCount}
              </div>
            )}
            <button className="hostess-next-btn" onClick={handleNext}>Далее</button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="hostess-footer">
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
