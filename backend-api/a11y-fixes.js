// ===========================================================================
// Accessibility DOM fixes — the counterpart to css-fixes.js for WCAG failures
// that CANNOT be expressed in CSS (a missing skip link, links with no accessible
// name, unlabeled inputs, no <main> landmark, ARIA attributes on role-less nodes).
//
// Those audits carried recipes whose `field` already named "seo-agent-a11y.js",
// but no such channel ever existed — so every one of them approved straight into
// "needs manual action · nothing was written" and stayed there forever.
//
// Each rule emits an IDEMPOTENT snippet: safe to run on every page load, safe to
// re-apply, and it never overwrites author-provided text/labels — it only fills a
// gap Lighthouse actually flagged. Output is one <script> the mu-plugin prints in
// the footer (DOM already parsed).
// ===========================================================================

const RULES = {
  // Keyboard users need a way past the nav. Injected as the first focusable element,
  // visually hidden until focused. Paired CSS is emitted alongside.
  'skip-link': () => ({
    note: 'Add a focusable "Skip to content" link (WCAG 2.4.1)',
    js: `(function(){
  if (document.getElementById('seoagent-skip')) return;
  var main = document.querySelector('main, [role="main"], #main, #content, .site-main, article');
  if (!main) return;
  if (!main.id) main.id = 'seoagent-main';
  var a = document.createElement('a');
  a.id = 'seoagent-skip'; a.className = 'seoagent-skip'; a.href = '#' + main.id;
  a.textContent = 'Skip to content';
  document.body.insertBefore(a, document.body.firstChild);
})();`,
    css: `.seoagent-skip{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:100000}
.seoagent-skip:focus{left:8px;top:8px;width:auto;height:auto;padding:10px 16px;background:#fff;color:#111;border:2px solid #111;border-radius:6px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none}`,
  }),

  // A link whose only content is an icon/image has no accessible name. Derive one
  // from title/alt/aria-label/href — never invent, and never touch links that
  // already expose text.
  'link-name': () => ({
    note: 'Give unnamed links an accessible name (WCAG 4.1.2 / 2.4.4)',
    js: `(function(){
  function nameFor(a){
    var t=(a.getAttribute('title')||'').trim(); if(t) return t;
    var img=a.querySelector('img[alt]'); if(img&&img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    var sr=a.querySelector('.screen-reader-text,.sr-only,.visually-hidden');
    if(sr&&sr.textContent.trim()) return sr.textContent.trim();
    var href=a.getAttribute('href')||'';
    if(/^tel:/i.test(href)) return 'Call '+href.replace(/^tel:/i,'');
    if(/^mailto:/i.test(href)) return 'Email '+href.replace(/^mailto:/i,'');
    var cls=(a.className||'')+' '+((a.firstElementChild&&a.firstElementChild.className)||'');
    var soc=['facebook','twitter','instagram','linkedin','youtube','whatsapp','tiktok','pinterest'];
    for(var i=0;i<soc.length;i++) if(cls.toLowerCase().indexOf(soc[i])>-1) return soc[i].charAt(0).toUpperCase()+soc[i].slice(1);
    if(/close|dismiss/i.test(cls)) return 'Close';
    if(/search/i.test(cls)) return 'Search';
    if(/menu|toggle|hamburger/i.test(cls)) return 'Menu';
    var slug=href.split('?')[0].split('#')[0].replace(/\\/$/,'').split('/').pop();
    if(slug&&!/^\\d+$/.test(slug)) return slug.replace(/[-_]+/g,' ').replace(/\\b\\w/g,function(c){return c.toUpperCase();});
    return '';
  }
  var links=document.querySelectorAll('a[href]');
  for(var i=0;i<links.length;i++){
    var a=links[i];
    if((a.textContent||'').trim()) continue;
    if((a.getAttribute('aria-label')||'').trim()) continue;
    if(a.getAttribute('aria-labelledby')) continue;
    var n=nameFor(a); if(n) a.setAttribute('aria-label', n);
  }
})();`,
  }),

  // Inputs with no <label>/aria-label — most often the theme's search field.
  'label': () => ({
    note: 'Label form inputs that have no accessible name (WCAG 3.3.2)',
    js: `(function(){
  var els=document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea');
  for(var i=0;i<els.length;i++){
    var el=els[i];
    if((el.getAttribute('aria-label')||'').trim()||el.getAttribute('aria-labelledby')) continue;
    if(el.id&&document.querySelector('label[for="'+el.id.replace(/"/g,'\\\\"')+'"]')) continue;
    if(el.closest&&el.closest('label')) continue;
    var n=(el.getAttribute('placeholder')||'').trim()
      || (el.getAttribute('name')||'').replace(/[-_]+/g,' ').trim()
      || (el.type==='search'?'Search':'');
    if(n) el.setAttribute('aria-label', n.charAt(0).toUpperCase()+n.slice(1));
  }
})();`,
  }),

  // Exactly one <main> landmark. If the theme has none, mark the content container.
  'landmark-one-main': () => ({
    note: 'Expose a single <main> landmark (WCAG 1.3.1)',
    js: `(function(){
  if(document.querySelector('main, [role="main"]')) return;
  var c=document.querySelector('#main, #content, .site-main, .entry-content, article');
  if(c) c.setAttribute('role','main');
})();`,
  }),

  // aria-label on a node with no (or a prohibited) role is ignored by AT and fails audit.
  'aria-prohibited-attr': () => ({
    note: 'Remove ARIA labels from elements whose role cannot carry them (WCAG 4.1.2)',
    js: `(function(){
  var els=document.querySelectorAll('[aria-label]');
  for(var i=0;i<els.length;i++){
    var el=els[i], tag=el.tagName.toLowerCase();
    if(el.getAttribute('role')) continue;
    if(['a','button','input','select','textarea','img','area','iframe','nav','main','header','footer','aside','section','form','dialog','table','svg'].indexOf(tag)>-1) continue;
    if(el.hasAttribute('tabindex')) continue;
    // A generic div/span/p with aria-label and no role: give it a role that CAN
    // carry the name rather than silently dropping the author's intent.
    el.setAttribute('role','group');
  }
})();`,
  }),

  // Images with no alt attribute at all (empty alt="" is a valid decorative marker).
  'image-alt': () => ({
    note: 'Give images a non-decorative alt where one is missing (WCAG 1.1.1)',
    js: `(function(){
  var imgs=document.querySelectorAll('img:not([alt])');
  for(var i=0;i<imgs.length;i++){
    var im=imgs[i];
    var t=(im.getAttribute('title')||'').trim();
    if(!t){
      var src=(im.getAttribute('src')||'').split('?')[0].split('/').pop()||'';
      t=src.replace(/\\.[a-z0-9]+$/i,'').replace(/[-_]+/g,' ').replace(/\\b\\d{2,}x\\d{2,}\\b/g,'').trim();
    }
    im.setAttribute('alt', t ? t.charAt(0).toUpperCase()+t.slice(1) : '');
  }
})();`,
  }),

  // <html lang> missing/invalid — screen readers pick the wrong voice.
  'html-has-lang': () => ({
    note: 'Set a document language on <html> (WCAG 3.1.1)',
    js: `(function(){
  var h=document.documentElement;
  if(!h.getAttribute('lang')) h.setAttribute('lang','en-GB');
})();`,
  }),
};
RULES['link-text'] = RULES['link-name'];          // same DOM repair, SEO-framed audit id
RULES['aria-allowed-attr'] = RULES['aria-prohibited-attr'];
RULES['aria-command-name'] = RULES['link-name'];
RULES['button-name'] = () => ({
  note: 'Give unnamed buttons an accessible name (WCAG 4.1.2)',
  js: `(function(){
  var bs=document.querySelectorAll('button,[role="button"],input[type=submit],input[type=button]');
  for(var i=0;i<bs.length;i++){
    var b=bs[i];
    if((b.textContent||'').trim()||(b.value||'').trim()) continue;
    if((b.getAttribute('aria-label')||'').trim()||b.getAttribute('aria-labelledby')) continue;
    var t=(b.getAttribute('title')||'').trim();
    var cls=((b.className||'')+' '+((b.firstElementChild&&b.firstElementChild.className)||'')).toLowerCase();
    if(!t){ if(/close|dismiss/.test(cls)) t='Close'; else if(/search/.test(cls)) t='Search'; else if(/menu|toggle|hamburger/.test(cls)) t='Menu'; else if(/play/.test(cls)) t='Play'; else if(/submit|send/.test(cls)) t='Submit'; }
    if(t) b.setAttribute('aria-label', t);
  }
})();`,
});

// Build the a11y script (and any paired CSS) from a list of findings.
// Returns { js, css, rules:[{auditId,note}], fixableCount }.
function generateA11yFixes(findings) {
  const seen = new Set();
  const rules = [];
  for (const f of findings || []) {
    const id = f._auditId || f.auditId || f.id;
    if (!id || seen.has(id) || !RULES[id]) continue;
    seen.add(id);
    const r = RULES[id]();
    rules.push({ auditId: id, note: r.note, js: r.js, css: r.css || '' });
  }
  if (!rules.length) return { js: '', css: '', rules: [], fixableCount: 0 };
  const body = rules.map((r) => `\n/* [${r.auditId}] ${r.note} */\ntry{${r.js}}catch(e){}`).join('\n');
  const js = `/* seo-agent accessibility fixes — ${rules.length} rule(s). Idempotent; safe to re-run. */\n(function(){function run(){${body}\n}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();})();`;
  const css = rules.filter((r) => r.css).map((r) => `/* [${r.auditId}] ${r.note} */\n${r.css}`).join('\n');
  return { js, css, rules: rules.map((r) => ({ auditId: r.auditId, note: r.note })), fixableCount: rules.length };
}

export { generateA11yFixes, RULES };
export default { generateA11yFixes };
