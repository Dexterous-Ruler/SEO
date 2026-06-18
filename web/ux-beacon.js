/*!
 * ux-beacon.js — Sentinel first-party RUM beacon (vanilla JS, no build step)
 * ---------------------------------------------------------------------------
 * INERT BY DEFAULT. This script collects NOTHING until it is both (a) configured
 * by the mu-plugin via window.__SENTINEL_RUM and (b) explicitly permitted to run.
 *
 * CONSENT GATE: when consent.mode === 'required' (the safe default posture for
 * EU/UK visitors) this beacon stays fully inert until a consent signal is
 * present — either a consent cookie set by the site's CMP, or an explicit
 * window.__SENTINEL_CONSENT === true flag. No cookie / no flag => no collection.
 * Global Privacy Control and Do Not Track are always honoured and force inert.
 *
 * NO-PII INVARIANTS (enforced at the source, before anything is buffered):
 *   - URLs are reduced to pathname only (origin + query + fragment stripped).
 *   - Free text is truncated to 200 chars and scrubbed of emails, phone
 *     numbers, UK postcodes, card-like numbers and NI numbers.
 *   - Form fields NEVER carry their value; sensitive field names are redacted.
 *   - Only same-origin resource/ajax telemetry is recorded.
 *   - Passive observation only — fetch/XHR are never monkey-patched (protects INP).
 *
 * Self-protecting: every handler is wrapped so it can never throw into the page;
 * a misbehaving observer disables only itself.
 */
(function () {
  'use strict';

  // ---- Config + inert guards ----
  var CFG = window.__SENTINEL_RUM;
  if (!CFG || typeof CFG !== 'object') { return; }
  if (!CFG.key || !CFG.endpoint) { return; }

  var nav = navigator || {};
  if (nav.globalPrivacyControl === true) { return; }
  if (nav.doNotTrack === '1' || window.doNotTrack === '1') { return; }

  var consent = CFG.consent || {};
  if (consent.mode === 'required' && !consentPresent(consent)) { return; }

  function consentPresent(c) {
    try {
      if (window.__SENTINEL_CONSENT === true) { return true; }
      if (c && c.cookie) {
        var needle = c.cookie + '=' + (c.value || '');
        var cookies = String(document.cookie || '').split(/;\s*/);
        for (var i = 0; i < cookies.length; i++) {
          if (cookies[i] === needle) { return true; }
          if (!c.value && cookies[i].indexOf(c.cookie + '=') === 0 &&
              cookies[i].length > (c.cookie.length + 1)) { return true; }
        }
      }
    } catch (e) {}
    return false;
  }

  // ---- Sampling (in-memory, per page view; no storage write) ----
  var sample = typeof CFG.sample === 'number' ? CFG.sample : 0;
  var SAMPLED = Math.random() < sample;
  // High-value types are always captured even when sampled out.
  var ALWAYS = {
    js_error: 1, unhandled_rejection: 1, dest_404: 1,
    ajax_4xx: 1, broken_resource: 1
  };

  var ORIGIN = location.origin;
  var ENDPOINT = String(CFG.endpoint).replace(/\/+$/, '') + '/ux-beacon';

  // ---- Scrub-at-source helpers ----
  function pathOnly(url) {
    try {
      if (!url) { return ''; }
      var u = new URL(url, ORIGIN);
      return u.pathname || '';
    } catch (e) {
      var s = String(url).split('#')[0].split('?')[0];
      return s.replace(/^[a-z]+:\/\/[^/]+/i, '') || s;
    }
  }

  var RX_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  var RX_CARD = /\b(?:\d[ -]?){13,16}\b/g;
  var RX_PHONE = /\+?\d[\d\s().-]{7,}\d/g;
  var RX_NI = /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi;
  var RX_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi;

  function scrubText(s) {
    if (s == null) { return ''; }
    s = String(s);
    if (s.length > 200) { s = s.slice(0, 200); }
    try {
      s = s.replace(RX_EMAIL, '[redacted]')
           .replace(RX_NI, '[redacted]')
           .replace(RX_POSTCODE, '[redacted]')
           .replace(RX_CARD, '[redacted]')
           .replace(RX_PHONE, '[redacted]');
    } catch (e) {}
    return s;
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) { try { return CSS.escape(s); } catch (e) {} }
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function stableSelector(el) {
    try {
      if (!el || el.nodeType !== 1) { return ''; }
      if (el.id) { return '#' + cssEscape(el.id); }
      var attrs = el.attributes || [];
      for (var i = 0; i < attrs.length; i++) {
        var a = attrs[i];
        if (a.name.indexOf('data-') === 0 && a.value) {
          var sel = '[' + a.name + '="' + a.value.replace(/"/g, '\\"') + '"]';
          try { if (document.querySelectorAll(sel).length === 1) { return sel; } } catch (e) {}
        }
      }
      var role = el.getAttribute && el.getAttribute('role');
      var anc = el.parentNode;
      while (anc && anc.nodeType === 1) {
        if (anc.id) {
          return '#' + cssEscape(anc.id) + ' ' + tagPart(el, role);
        }
        anc = anc.parentNode;
      }
      var parts = [], cur = el, depth = 0;
      while (cur && cur.nodeType === 1 && depth < 3) {
        parts.unshift(tagPart(cur, cur.getAttribute && cur.getAttribute('role')));
        if (cur.id) { parts[0] = '#' + cssEscape(cur.id); break; }
        cur = cur.parentNode; depth++;
      }
      return parts.join('>');
    } catch (e) { return ''; }
  }

  function tagPart(el, role) {
    var t = (el.tagName || '').toLowerCase();
    if (role) { t += '[role="' + role + '"]'; }
    var parent = el.parentNode;
    if (parent && parent.children) {
      var n = 0, idx = 0, same = 0;
      for (var i = 0; i < parent.children.length; i++) {
        var c = parent.children[i];
        if (c.tagName === el.tagName) {
          same++;
          if (c === el) { idx = same; }
        }
      }
      if (same > 1) { t += ':nth-of-type(' + idx + ')'; }
    }
    return t;
  }

  function stackHash(str) {
    var h = 5381, i = str ? str.length : 0;
    while (i) { h = (h * 33) ^ str.charCodeAt(--i); }
    return (h >>> 0).toString(36);
  }

  // ---- Buffer + flush ----
  var BUF = [];
  var CAP = 20;
  var sent = false;
  var idleTimer = null;

  function keyOf(ev) {
    return (ev.type || '') + '|' + (ev.selector || '') + '|' + (ev.stackHash || '');
  }

  function capture(ev) {
    try {
      if (sent) { return; }
      if (!SAMPLED && !ALWAYS[ev.type]) { return; }
      var k = keyOf(ev);
      for (var i = 0; i < BUF.length; i++) {
        if (BUF[i]._k === k) { BUF[i].count = (BUF[i].count || 1) + 1; return; }
      }
      ev._k = k;
      ev.count = 1;
      BUF.push(ev);
      if (BUF.length >= CAP) { flush(); return; }
      armIdle();
    } catch (e) {}
  }

  function armIdle() {
    try {
      if (idleTimer) { clearTimeout(idleTimer); }
      idleTimer = setTimeout(flush, 15000);
    } catch (e) {}
  }

  function flush() {
    try {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (!BUF.length) { return; }
      var events = [];
      for (var i = 0; i < BUF.length; i++) {
        var e = BUF[i]; delete e._k; events.push(e);
      }
      BUF = [];
      var payload = {
        k: CFG.key,
        p: location.pathname,
        ts: Date.now(),
        sampled: SAMPLED,
        e: events
      };
      var body = JSON.stringify(payload);
      var blob;
      try { blob = new Blob([body], { type: 'text/plain' }); } catch (e) { blob = body; }
      var ok = false;
      if (nav.sendBeacon) {
        try { ok = nav.sendBeacon(ENDPOINT, blob); } catch (e) { ok = false; }
      }
      if (!ok && window.fetch) {
        try {
          fetch(ENDPOINT, {
            method: 'POST',
            body: body,
            keepalive: true,
            headers: { 'Content-Type': 'text/plain' }
          }).catch(function () {});
        } catch (e) {}
      }
    } catch (e) {}
  }

  // ---- Event 1: js_error / broken_resource (from error events) ----
  function onError(e) {
    try {
      var tgt = e && e.target;
      if (tgt && tgt.nodeType === 1) {
        var tag = (tgt.tagName || '').toUpperCase();
        if (tag === 'IMG' || tag === 'SCRIPT' || tag === 'LINK') {
          var raw = tgt.src || tgt.href || '';
          if (sameOrigin(raw)) {
            capture({ type: 'broken_resource', src: pathOnly(raw), tag: tag.toLowerCase() });
          }
          return;
        }
      }
      var msg = scrubText(e && e.message);
      var stk = (e && e.error && e.error.stack) ? String(e.error.stack) : '';
      capture({
        type: 'js_error',
        message: msg,
        source: pathOnly(e && e.filename),
        lineno: (e && e.lineno) || 0,
        colno: (e && e.colno) || 0,
        stackHash: stackHash(stk || (msg + (e && e.filename)))
      });
    } catch (err) {}
  }

  function sameOrigin(url) {
    try { return new URL(url, ORIGIN).origin === ORIGIN; } catch (e) { return false; }
  }

  // ---- Event 2: unhandled_rejection ----
  function onRejection(e) {
    try {
      var reason = e && e.reason;
      var s;
      try { s = (reason && reason.stack) ? reason.stack : (reason && reason.message) ? reason.message : reason; }
      catch (x) { s = reason; }
      var txt = scrubText(s);
      capture({ type: 'unhandled_rejection', message: txt, stackHash: stackHash(String(s == null ? '' : s)) });
    } catch (err) {}
  }

  // ---- Events 3 + 4: broken_resource + ajax_4xx (PerformanceObserver) ----
  var resObs = null;
  function startResourceObserver() {
    try {
      if (typeof PerformanceObserver === 'undefined') { return; }
      resObs = new PerformanceObserver(function (list) {
        try {
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i++) {
            handleResEntry(entries[i]);
          }
        } catch (e) { try { resObs.disconnect(); } catch (x) {} resObs = null; }
      });
      resObs.observe({ type: 'resource', buffered: true });
    } catch (e) { resObs = null; }
  }

  function handleResEntry(entry) {
    try {
      var status = entry && entry.responseStatus; // guarded: not all browsers expose it
      if (typeof status !== 'number' || status < 400) { return; }
      var name = entry.name || '';
      if (!sameOrigin(name)) { return; }
      var path = pathOnly(name);
      if (status >= 400 && status <= 499 &&
          (path.indexOf('/wp-json') === 0 || path === '/wp-admin/admin-ajax.php')) {
        capture({ type: 'ajax_4xx', src: path, status: status });
      } else {
        capture({ type: 'broken_resource', src: path, status: status });
      }
    } catch (e) {}
  }

  // ---- Event 5: dest_404 ----
  function checkDest404() {
    try {
      if (!document.querySelector('meta[name="sentinel-404"]')) { return; }
      var ref = '';
      try {
        if (document.referrer && sameOrigin(document.referrer)) {
          ref = pathOnly(document.referrer);
        }
      } catch (e) {}
      capture({ type: 'dest_404', referrer: ref });
    } catch (e) {}
  }

  // ---- Event 6: broken_cta (single idle DOM scan) ----
  var DEAD_HREF = { '#': 1, '': 1, 'javascript:void(0)': 1 };
  function scanBrokenCtas() {
    try {
      var anchors = document.getElementsByTagName('a');
      var found = 0;
      for (var i = 0; i < anchors.length && found < 10; i++) {
        var a = anchors[i];
        var href = (a.getAttribute('href') || '').trim();
        if (!DEAD_HREF[href.toLowerCase()]) { continue; }
        if (!looksLikeCta(a)) { continue; }
        var label = scrubText((a.textContent || '').replace(/\s+/g, ' ').trim());
        capture({ type: 'broken_cta', selector: stableSelector(a), label: label });
        found++;
      }
    } catch (e) {}
  }

  function looksLikeCta(a) {
    try {
      var cls = ((a.className && a.className.baseVal != null ? a.className.baseVal : a.className) || '') + '';
      var role = (a.getAttribute('role') || '');
      var hay = (cls + ' ' + role).toLowerCase();
      if (/button|cta|btn/.test(hay)) { return true; }
      if (a.closest && a.closest('.elementor-button')) { return true; }
    } catch (e) {}
    return false;
  }

  // ---- Event 7: form_validation ----
  var VALIDITY_FLAGS = [
    'valueMissing', 'typeMismatch', 'patternMismatch', 'tooLong',
    'tooShort', 'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput'
  ];
  var SENSITIVE_TYPES = { password: 1, email: 1, tel: 1, number: 1 };

  function onInvalid(e) {
    try {
      var el = e && e.target;
      if (!el || el.nodeType !== 1) { return; }
      var type = (el.type || '').toLowerCase();
      var sensitive = SENSITIVE_TYPES[type] ||
        (el.hasAttribute && el.hasAttribute('data-sensitive'));
      var name = sensitive ? '[sensitive]' : scrubText(el.name || el.id || '');
      var flag = '';
      var v = el.validity;
      if (v) {
        for (var i = 0; i < VALIDITY_FLAGS.length; i++) {
          if (v[VALIDITY_FLAGS[i]]) { flag = VALIDITY_FLAGS[i]; break; }
        }
      }
      capture({
        type: 'form_validation',
        field: name,
        fieldType: type,
        validity: flag,
        selector: stableSelector(el)
      });
    } catch (err) {}
  }

  // ---- Wiring ----
  function safe(fn) {
    return function (ev) { try { fn(ev); } catch (e) {} };
  }

  try {
    // capture phase needed for resource errors + invalid (they don't bubble)
    window.addEventListener('error', safe(onError), true);
    window.addEventListener('unhandledrejection', safe(onRejection));
    document.addEventListener('invalid', safe(onInvalid), true);

    startResourceObserver();

    // flush triggers
    document.addEventListener('visibilitychange', function () {
      try { if (document.visibilityState === 'hidden') { flush(); } } catch (e) {}
    });
    window.addEventListener('pagehide', safe(flush));

    // load-time work
    var onReady = function () {
      checkDest404();
      // Idle DOM scans only when NOT sampled out (skip for always-only mode).
      if (SAMPLED) {
        var ric = window.requestIdleCallback || function (cb) { return setTimeout(cb, 1); };
        ric(function () { scanBrokenCtas(); });
      }
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      onReady();
    } else {
      window.addEventListener('DOMContentLoaded', safe(onReady));
    }
  } catch (e) {}
})();
