/* ============================================================
   SEO Agent — site-wide accessibility JS patches for go-legal.ai
   Loaded in the footer by functions-snippet.php.

   Fixes Elementor-generated issues GLOBALLY (every page, every widget
   instance) instead of editing each widget by hand:
     - A3: ARIA prohibited — <div class="e-n-tabs"> with aria-label but no role
     - A2/S1: popup "live-guidance" links with no accessible name

   Conservative: only ADDS roles/labels to elements that are missing them.
   Never removes or rewrites existing attributes. Runs after DOM ready.
   ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // ---- A3: give Elementor nested-tabs a valid role for their aria-label ----
    // aria-label is prohibited on a <div> with no role; tablist is the correct role.
    document.querySelectorAll('.e-n-tabs[aria-label]:not([role])').forEach(function (el) {
      el.setAttribute('role', 'tablist');
    });

    // ---- A2/S1: name the empty popup/guidance links ----
    // These links open Elementor popups and have no text. Derive a sensible
    // label from nearby context, fall back to a generic one.
    document.querySelectorAll('a.live-guidance, .single-price-item a[href*="elementor-action"]').forEach(function (a) {
      var hasText = (a.textContent || '').trim().length > 0;
      var hasLabel = a.hasAttribute('aria-label') || a.hasAttribute('title');
      if (hasText || hasLabel) return;
      // Try the closest pricing/section heading for context.
      var ctx = a.closest('.single-price-item, .elementor-widget') || document;
      var heading = ctx.querySelector('h2, h3, .elementor-price-table__title');
      var label = heading ? ('Get live guidance: ' + heading.textContent.trim()) : 'Get live guidance';
      a.setAttribute('aria-label', label);
    });

    // ---- A6 safety net: if still no main landmark, mark the content container --
    if (!document.querySelector('main, [role="main"]')) {
      var main = document.querySelector('.e-con-inner, .elementor-section-wrap, #content');
      if (main) { main.setAttribute('role', 'main'); main.id = main.id || 'content'; }
    }
  });
})();
