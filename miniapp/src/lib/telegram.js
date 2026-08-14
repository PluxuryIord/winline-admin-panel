// Thin wrapper over window.Telegram.WebApp so components never touch the global.
// Outside Telegram (plain browser / dev) every call is a safe no-op.

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

export const isTelegram = !!(tg && tg.initData);

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    // Fixed brand theme — keep the native chrome in sync with our dark bg.
    tg.setHeaderColor?.('#0A0A14');
    tg.setBackgroundColor?.('#0A0A14');
    tg.disableVerticalSwipes?.();
  } catch { /* older clients lack some methods */ }
}

export function getInitData() {
  return tg?.initData || '';
}

export function getTgUser() {
  return tg?.initDataUnsafe?.user || null; // display only — server trusts initData, not this
}

export function openTelegramLink(url) {
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function openLink(url) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Links inside dangerouslySetInnerHTML content are raw <a> tags: tapping one
// navigates the mini-app webview itself (opens "inside" the app). Intercept the
// click so it opens in the external browser instead (t.me → inside Telegram).
export function handleHtmlLinkClick(e) {
  const a = e.target?.closest?.('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  if (/^https:\/\/t\.me\//.test(href)) openTelegramLink(href);
  else openLink(href);
}

export function haptic(type = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch { /* noop */ }
}

// Native Telegram alert popup (single OK button). Falls back to browser alert
// outside Telegram or on older clients without showAlert.
export function showAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else if (tg?.showPopup) tg.showPopup({ message });
  else if (typeof window !== 'undefined') window.alert(message);
}

// Back button: show while a callback is registered, hide when cleared.
let backHandler = null;
export function setBackButton(handler) {
  if (!tg?.BackButton) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = handler || null;
  if (handler) {
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

export function setClosingConfirmation(on) {
  try {
    if (on) tg?.enableClosingConfirmation?.();
    else tg?.disableClosingConfirmation?.();
  } catch { /* noop */ }
}
