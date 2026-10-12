// License handling via the Lemon Squeezy License API.
// Customers receive a license key by email after subscribing; they paste it
// into the app once. Subscriptions that lapse are reported as invalid on the
// next re-validation, which downgrades the app back to the Free plan.
(() => {
  'use strict';
  const CFG = window.APP_CONFIG;
  const STORE_KEY = 'glidecast.license';
  const API = 'https://api.lemonsqueezy.com/v1/licenses';
  const DAY = 864e5;
  const RECHECK_AFTER = 3 * DAY;
  const OFFLINE_GRACE = 14 * DAY;

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; } };
  const save = (v) => { try { v ? localStorage.setItem(STORE_KEY, JSON.stringify(v)) : localStorage.removeItem(STORE_KEY); } catch { /* storage blocked */ } };

  let current = load();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(current); } catch (e) { console.error(e); } });

  async function call(action, params) {
    const body = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, v); });
    const res = await fetch(`${API}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.json().catch(() => ({}));
  }

  function belongsToUs(meta) {
    const ls = CFG.lemonSqueezy || {};
    if (ls.storeId && Number(meta?.store_id) !== Number(ls.storeId)) return false;
    if (ls.productIds?.length && !ls.productIds.map(Number).includes(Number(meta?.product_id))) return false;
    return true;
  }

  const instanceName = () => {
    const ua = navigator.userAgentData?.platform || navigator.platform || 'web';
    return `${CFG.name} web · ${ua} · ${new Date().toISOString().slice(0, 10)}`;
  };

  window.License = {
    isPro() {
      if (CFG.devForcePro) return true;
      return !!(current && current.valid);
    },
    info() { return current; },
    onChange(fn) { listeners.add(fn); },

    async activate(rawKey) {
      const key = (rawKey || '').trim();
      if (!key) throw new Error('Paste the license key from your purchase email.');
      let j;
      try { j = await call('activate', { license_key: key, instance_name: instanceName() }); }
      catch { throw new Error('Could not reach the license server. Check your connection and try again.'); }
      if (!j.activated) throw new Error(j.error || 'That license key could not be activated.');
      if (!belongsToUs(j.meta)) throw new Error('This license key belongs to a different product.');
      current = {
        key,
        instanceId: j.instance?.id || null,
        valid: true,
        status: j.license_key?.status || 'active',
        email: j.meta?.customer_email || '',
        checkedAt: Date.now(),
      };
      save(current);
      emit();
      return current;
    },

    async deactivate() {
      if (current?.instanceId) {
        try { await call('deactivate', { license_key: current.key, instance_id: current.instanceId }); } catch { /* ignore */ }
      }
      current = null;
      save(null);
      emit();
    },

    async refresh(force = false) {
      if (!current) return;
      const age = Date.now() - (current.checkedAt || 0);
      if (!force && current.valid && age < RECHECK_AFTER) return;
      try {
        const j = await call('validate', { license_key: current.key, instance_id: current.instanceId });
        if (typeof j.valid === 'boolean') {
          current.valid = j.valid && belongsToUs(j.meta);
          current.status = j.license_key?.status || current.status;
          current.checkedAt = Date.now();
          save(current);
          emit();
        }
      } catch {
        // Offline: keep Pro for a grace period, then fall back to Free.
        if (age > OFFLINE_GRACE && current.valid) {
          current.valid = false;
          save(current);
          emit();
        }
      }
    },
  };
})();
