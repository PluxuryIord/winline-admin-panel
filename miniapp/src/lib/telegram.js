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

export function haptic(type = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch { /* noop */ }
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
