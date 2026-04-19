// ═══════════════════════════════════════════════
// AllNet — Push Notifications Client Module
// ═══════════════════════════════════════════════

const PushManager_ = (function() {

  // VAPID public key (base64url-encoded)
  const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA';

  let swRegistration = null;

  // ── Helpers ──

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function isIosSafari() {
    const ua = navigator.userAgent;
    // iPhone/iPod: straightforward UA check
    if (/iPhone|iPod/.test(ua) && !window.MSStream) return true;
    // iPad: since iPadOS 13, iPads report as "Macintosh" — detect via touch + Mac combo
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function isMacSafari() {
    const ua = navigator.userAgent;
    // macOS Safari (Sonoma+ supports Add to Dock with push)
    return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua) && navigator.maxTouchPoints === 0;
  }

  function isAndroid() {
    return /Android/.test(navigator.userAgent);
  }

  function isInstalledPWA() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  // ── Service Worker Registration ──

  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('AllNet Push: Service workers not supported');
      return null;
    }
    try {
      swRegistration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('AllNet Push: SW registered');
      return swRegistration;
    } catch (err) {
      console.error('AllNet Push: SW registration failed', err);
      return null;
    }
  }

  // ── Push Subscription ──

  async function getExistingSubscription() {
    if (!swRegistration) return null;
    return await swRegistration.pushManager.getSubscription();
  }

  async function subscribe() {
    if (!swRegistration) {
      await registerSW();
      if (!swRegistration) return null;
    }

    // Check if already subscribed
    let subscription = await getExistingSubscription();
    if (subscription) return subscription;

    try {
      subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('AllNet Push: subscribed');
      return subscription;
    } catch (err) {
      console.error('AllNet Push: subscription failed', err);
      return null;
    }
  }

  // ── Save subscription to Supabase ──

  async function saveSubscription(subscription) {
    if (!subscription || !supabase || typeof currentUser === 'undefined' || !currentUser) return false;
    const sub = subscription.toJSON();
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: currentUser.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('AllNet Push: failed to save subscription', error);
      return false;
    }
    console.log('AllNet Push: subscription saved to DB');
    return true;
  }

  // ── Remove subscription from Supabase (logout) ──

  async function removeSubscription() {
    if (!swRegistration) return;
    const subscription = await getExistingSubscription();
    if (!subscription) return;

    const sub = subscription.toJSON();

    // Remove from DB
    if (supabase && typeof currentUser !== 'undefined' && currentUser) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('endpoint', sub.endpoint);
    }

    // Unsubscribe from browser
    await subscription.unsubscribe();
    console.log('AllNet Push: unsubscribed and removed from DB');
  }

  // ── Re-subscribe silently (after login) ──

  async function resubscribeSilently() {
    // Only try if permission was already granted in a prior session
    if (Notification.permission !== 'granted') return;
    const subscription = await subscribe();
    if (subscription) {
      await saveSubscription(subscription);
    }
  }

  // ── Permission + Subscribe (triggered on first watch) ──

  async function requestPermissionAndSubscribe() {
    if (!('Notification' in window)) {
      console.log('AllNet Push: Notifications API not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      const sub = await subscribe();
      if (sub) await saveSubscription(sub);
      return true;
    }

    if (Notification.permission === 'denied') {
      console.log('AllNet Push: permission previously denied');
      return false;
    }

    // Permission is 'default' — ask the user
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const sub = await subscribe();
      if (sub) await saveSubscription(sub);
      return true;
    }
    return false;
  }

  // ── Add to Home Screen / Install PWA ──

  let deferredInstallPrompt = null; // Chrome/Edge beforeinstallprompt event

  function showA2HSBannerIfNeeded() {
    if (isInstalledPWA()) return;
    if (localStorage.getItem('allnet_a2hs_dismissed')) return;

    // Determine which platform we're on for appropriate messaging
    let bannerText = '';
    let howBtn = true;

    if (isIosSafari()) {
      bannerText = 'Get court alerts even when the browser is closed';
    } else if (isMacSafari()) {
      bannerText = 'Add AllNet to your Dock for push notifications';
    } else if (deferredInstallPrompt) {
      // Chrome/Edge on Android or Desktop — use native prompt
      bannerText = 'Install AllNet for the best experience';
      howBtn = false; // Chrome handles install natively
    } else {
      // Not a supported install scenario (Firefox, Chrome without prompt, etc.)
      return;
    }

    // Don't double-add
    if (document.getElementById('a2hsBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'a2hsBanner';
    banner.innerHTML = `
      <div class="a2hs-banner">
        <div class="a2hs-banner__content">
          <div class="a2hs-banner__icon">🏀</div>
          <div class="a2hs-banner__text">
            <strong>Add AllNet to your Home Screen</strong>
            <span>${bannerText}</span>
          </div>
        </div>
        <div class="a2hs-banner__actions">
          ${howBtn
            ? '<button class="a2hs-banner__how" onclick="PushManager_.showA2HSInstructions()">How?</button>'
            : '<button class="a2hs-banner__how" onclick="PushManager_.triggerInstallPrompt()">Install</button>'
          }
          <button class="a2hs-banner__dismiss" onclick="PushManager_.dismissA2HS()">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
  }

  function showA2HSInstructions() {
    if (typeof showAlert !== 'function') return;

    if (isIosSafari()) {
      showAlert('Add to Home Screen',
        '1. Tap the Share button ⬆ at the bottom of Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"\n\nYou\'ll then get push notifications for court alerts!',
        { icon: '📲' }
      );
    } else if (isMacSafari()) {
      showAlert('Add to Dock',
        '1. Click File in the menu bar\n2. Click "Add to Dock"\n3. Click "Add"\n\nYou\'ll then get push notifications for court alerts!',
        { icon: '📲' }
      );
    }
  }

  // Chrome/Edge native install prompt
  function triggerInstallPrompt() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          dismissA2HS();
        }
        deferredInstallPrompt = null;
      });
    }
  }

  function dismissA2HS() {
    localStorage.setItem('allnet_a2hs_dismissed', '1');
    const el = document.getElementById('a2hsBanner');
    if (el) el.remove();
  }

  // Listen for Chrome/Edge beforeinstallprompt (fires before we can show our banner)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // If profile is already loaded, show banner now
    if (!isInstalledPWA() && !localStorage.getItem('allnet_a2hs_dismissed')) {
      showA2HSBannerIfNeeded();
    }
  });

  // ── Soft prompt (shown during onboarding) ──

  function showSoftPrompt() {
    // Don't show if permission already granted or denied
    if ('Notification' in window && Notification.permission !== 'default') return;

    if (typeof showAlert === 'function') {
      showAlert('Stay in the Game',
        'AllNet can send you alerts when a court you\'re watching goes live. You\'ll be asked to allow notifications when you watch your first court.',
        { icon: '🔔' }
      );
    }
  }

  // ── Listen for messages from service worker ──

  function listenForSWMessages() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'OPEN_COURT' && event.data.courtId) {
        // Find the court and open its sheet
        const court = (typeof courts !== 'undefined' ? courts : []).find(c => c.id === event.data.courtId);
        if (court && typeof openSheet === 'function') {
          openSheet(court);
        }
      }
    });
  }

  // ── Init — called once on page load ──

  async function init() {
    await registerSW();
    listenForSWMessages();
  }

  // ── Public API ──
  return {
    init,
    subscribe,
    saveSubscription,
    removeSubscription,
    resubscribeSilently,
    requestPermissionAndSubscribe,
    showA2HSBannerIfNeeded,
    showA2HSInstructions,
    triggerInstallPrompt,
    dismissA2HS,
    showSoftPrompt
  };

})();
