<?php
/**
 * Plugin Name: SEO Agent — Live Optimize (WebP · Schema · CSS)
 * Description: The "apply" layer for wp-seo-agent. Lets the agent improve the LIVE
 *   site WITHOUT editing page content (safe on Elementor): (1) serves WebP for any
 *   image that has a .webp sibling when the browser supports it — so the WebP files
 *   the agent uploads are actually used; (2) injects per-page JSON-LD schema;
 *   (3) injects site-wide custom CSS; (4) inserts internal/external links into
 *   page content AND Elementor widgets (/insert-link). REST endpoints let the agent
 *   store schema/CSS and add links. Everything is reversible (clear the value/delete).
 * Version:     1.11.0
 * Author:      wp-seo-agent
 *
 * INSTALL: copy to wp-content/mu-plugins/ (create the folder if it doesn't exist).
 *          mu-plugins auto-activate and can't be turned off by accident.
 */

if (!defined('ABSPATH')) { exit; }

class SEO_Agent_Optimize {

    const VERSION = '1.11.0';   // single source of truth (keep in sync with the header above)

    /* Sentinel-owned SEO meta keys. Written by the agent via core REST post-meta
       (so they MUST be registered with show_in_rest), rendered into <head> by us
       ONLY on sites where no SEO plugin owns <head> — see render_meta(). */
    const META_KEYS = ['_seoagent_meta_title', '_seoagent_meta_description', '_seoagent_canonical'];

    private $meta_buf = false;  // true while our <head> buffer is open (keeps ob_start/ob_end balanced)

    public function __construct() {
        add_action('init', [$this, 'register_meta_keys']);
        add_action('template_redirect', [$this, 'start_webp_buffer'], 1);
        // Wrap wp_head in a buffer (priority 0 → 999) so we can inject a missing
        // <title>/description/canonical from our meta without ever duplicating one
        // the theme or an SEO plugin already printed.
        add_action('wp_head', [$this, 'meta_buffer_start'], 0);
        add_action('wp_head', [$this, 'output_jsonld'], 99);
        add_action('wp_head', [$this, 'output_css'], 100);
        add_action('wp_head', [$this, 'meta_buffer_end'], 999);
        add_action('rest_api_init', [$this, 'routes']);
        add_action('init', [$this, 'register_geo_settings']);
        add_action('parse_request', [$this, 'serve_llms_txt'], 1);
        add_filter('robots_txt', [$this, 'append_ai_robots'], 20, 2);
        // UX beacon (RUM) — INERT by default: prints nothing unless the
        // seoagent_ux_beacon option is present AND armed===true (see output_ux_beacon).
        add_action('wp_footer', [$this, 'output_ux_beacon'], 20);
        // First-party consent banner — INERT by default: prints nothing unless the
        // seoagent_consent_banner option is present AND enabled===true. For sites with
        // no third-party CMP, this gates the UX beacon (sets seoagent_consent=statistics).
        add_action('wp_footer', [$this, 'output_consent_banner'], 18);
        add_action('wp_head', [$this, 'output_404_marker'], 1);
    }

    /* ── Sentinel-owned SEO meta: register for REST so writes actually stick ───
       A POST to /wp/v2/{type}/{id} with an UNREGISTERED meta key returns 200 OK
       but silently DISCARDS the value (the silent-failure trap). Registering the
       keys makes the agent's apply-meta writes (verify-after-write) succeed. */
    public function register_meta_keys() {
        $auth = function () { return current_user_can('edit_posts'); };
        foreach (self::META_KEYS as $key) {
            foreach (['post', 'page'] as $obj) {
                register_post_meta($obj, $key, [
                    'type' => 'string', 'single' => true, 'show_in_rest' => true,
                    'auth_callback' => $auth,
                ]);
            }
        }
    }

    /* ── GEO: llms.txt + AI-bot robots rules (managed by Sentinel) ────────────
       The agent stores llms.txt content and AI-crawler robots directives as
       options; we serve /llms.txt directly and merge the robots rules into the
       virtual robots.txt. Reversible — clear the option to stop serving. */
    public function register_geo_settings() {
        register_setting('general', 'seoagent_llms_txt', ['type' => 'string', 'show_in_rest' => false]);
        register_setting('general', 'seoagent_ai_robots', ['type' => 'string', 'show_in_rest' => false]);
    }

    /* Serve /llms.txt from the stored option (parse_request hands us the WP obj). */
    public function serve_llms_txt($wp) {
        if (isset($wp->request) && $wp->request === 'llms.txt') {
            $c = get_option('seoagent_llms_txt', '');
            if ($c !== '') {
                header('Content-Type: text/plain; charset=utf-8');
                header('X-Robots-Tag: noindex');
                echo $c;
                exit;
            }
        }
    }

    /* Merge stored AI-bot directives into the virtual robots.txt output. */
    public function append_ai_robots($output, $public) {
        if (!$public) return $output;
        $r = get_option('seoagent_ai_robots', '');
        if ($r !== '') {
            $output = rtrim($output) . "\n\n# AI crawler directives (managed by Sentinel)\n" . $r . "\n";
        }
        return $output;
    }

    /* True when a real SEO plugin owns <head>. On those sites we stay dormant —
       the plugin (and the agent's rank_math_* writes) handle meta, so we must not
       add a second tag. On "none" sites this is false and we fill the gaps. */
    private function seo_plugin_owns_head() {
        return defined('RANK_MATH_VERSION') || class_exists('RankMath')
            || defined('WPSEO_VERSION')
            || defined('AIOSEO_VERSION') || function_exists('aioseo')
            || defined('SEOPRESS_VERSION');
    }

    public function meta_buffer_start() {
        if (is_admin() || is_feed() || !is_singular()) return;
        if ($this->seo_plugin_owns_head()) return;
        $this->meta_buf = true;
        ob_start([$this, 'render_meta']);
    }
    public function meta_buffer_end() {
        if ($this->meta_buf) { $this->meta_buf = false; @ob_end_flush(); }
    }

    /* Buffer callback: inject our meta into the captured wp_head HTML, but only a
       tag that isn't already present (no duplicates). Title replaces the theme's
       <title> inner text; description/canonical are appended if missing. */
    public function render_meta($head) {
        $id = get_queried_object_id();
        if (!$id) return $head;
        $desc  = trim((string) get_post_meta($id, '_seoagent_meta_description', true));
        $canon = trim((string) get_post_meta($id, '_seoagent_canonical', true));
        $title = trim((string) get_post_meta($id, '_seoagent_meta_title', true));
        $add = '';
        if ($desc !== '' && !preg_match('/<meta[^>]+name=["\']description["\']/i', $head)) {
            $add .= "\n<meta name=\"description\" content=\"" . esc_attr($desc) . "\" data-seoagent=\"1\">";
        }
        if ($canon !== '' && !preg_match('/<link[^>]+rel=["\']canonical["\']/i', $head)) {
            $add .= "\n<link rel=\"canonical\" href=\"" . esc_url($canon) . "\" data-seoagent=\"1\">";
        }
        if ($add !== '') $head .= $add . "\n";
        if ($title !== '') {
            // Callback (not a replacement string) so a title containing $1/\1 can't
            // be misread as a regex backreference.
            $safe = esc_html($title);
            $head = preg_replace_callback('/<title\b([^>]*)>.*?<\/title>/is', function ($m) use ($safe) {
                return '<title' . $m[1] . '>' . $safe . '</title>';
            }, $head, 1);
        }
        return $head;
    }

    /* ── WebP on-the-fly ─────────────────────────────────────────────────────
       Rewrites uploads image URLs (.jpg/.jpeg/.png) to .webp in the final HTML
       when (a) the browser sent Accept: image/webp and (b) the .webp file exists
       on disk. Catches <img src/srcset>, Elementor inline background-images, etc.
       — no page-content edits, fully reversible. */
    public function start_webp_buffer() {
        if (is_admin() || is_feed()) return;
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
        if (strpos($accept, 'image/webp') === false) return;
        ob_start([$this, 'rewrite_webp']);
    }

    public function rewrite_webp($html) {
        if (!$html || strlen($html) < 50) return $html;
        $u = wp_get_upload_dir();
        $baseurl = $u['baseurl'];
        $basedir = $u['basedir'];
        if (!$baseurl || !$basedir) return $html;
        // Agent-supplied map: original image URL → uploaded WebP URL (the agent stores
        // the WebP as a separate media item, so it isn't a same-folder sibling).
        $map = get_option('seoagent_webp_map', []);
        if (!is_array($map)) $map = [];
        // Normalise map keys to scheme-relative for robust matching.
        $bareMap = [];
        foreach ($map as $orig => $webp) { $bareMap[preg_replace('#^https?:#', '', $orig)] = $webp; }
        // Scheme-relative uploads base (matches http://, https://, and //host/...).
        $bareBase = preg_replace('#^https?:#', '', $baseurl);
        $pattern  = '#(?:https?:)?' . preg_quote($bareBase, '#') . '[^"\'\s)]+?\.(?:jpe?g|png)#i';
        static $exists = [];
        return preg_replace_callback($pattern, function ($m) use ($basedir, $bareBase, $bareMap, &$exists) {
            $url  = $m[0];
            $bare = preg_replace('#^https?:#', '', $url);
            if (isset($bareMap[$bare])) return $bareMap[$bare];          // 1) explicit map
            $webpUrl = preg_replace('/\.(jpe?g|png)$/i', '.webp', $url);  // 2) same-folder sibling
            $path = str_replace($bareBase, $basedir, preg_replace('#^https?:#', '', $webpUrl));
            if (!isset($exists[$path])) $exists[$path] = @file_exists($path);
            return $exists[$path] ? $webpUrl : $url;
        }, $html);
    }

    /* ── Per-page JSON-LD schema ─────────────────────────────────────────────
       Stored in post meta; output as an extra ld+json block (search engines merge
       multiple blocks, so this coexists with Rank Math). */
    public function output_jsonld() {
        if (!is_singular()) return;
        $json = get_post_meta(get_the_ID(), '_seoagent_jsonld', true);
        if ($json) {
            echo "\n<script type=\"application/ld+json\" data-seoagent=\"1\">" . $json . "</script>\n";
        }
    }

    /* ── Site-wide custom CSS ───────────────────────────────────────────────── */
    public function output_css() {
        $css = get_option('seoagent_custom_css', '');
        if ($css) {
            echo "\n<style id=\"seoagent-css\">" . wp_strip_all_tags($css) . "</style>\n";
        }
    }

    /* ── UX beacon (RUM) loader — INERT BY DEFAULT ───────────────────────────
       Consent-gated real-user-monitoring loader. Config lives in the
       'seoagent_ux_beacon' option as a JSON string:
         {"armed":false,"key":"","endpoint":"","sample":0.05,"consent":{"mode":"required"}}
       INERT GUARANTEE: with the option absent or armed!==true (the default),
       this prints NOTHING — behaviour is identical to v1.8.0. Only when the
       agent explicitly arms it do we emit a tiny cross-origin async loader; the
       beacon script itself self-gates on the visitor's consent. */
    public function output_ux_beacon() {
        if (is_admin() || is_feed()) return;
        $raw = get_option('seoagent_ux_beacon', '');
        if ($raw === '' || $raw === false) return;
        $cfg = json_decode((string) $raw, true);
        if (!is_array($cfg) || ($cfg['armed'] ?? null) !== true) return;   // INERT unless explicitly armed
        $endpoint = isset($cfg['endpoint']) ? (string) $cfg['endpoint'] : '';
        if ($endpoint === '') return;
        $rum = [
            'key'      => isset($cfg['key']) ? (string) $cfg['key'] : '',
            'endpoint' => $endpoint,
            'sample'   => isset($cfg['sample']) ? $cfg['sample'] : 0.05,
            'consent'  => $cfg['consent'] ?? ['mode' => 'required'],
            'page'     => isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '',
        ];
        $src = esc_url(rtrim($endpoint, '/') . '/ux-beacon.js');
        echo "\n<script data-seoagent=\"ux-beacon\">window.__SENTINEL_RUM = " . wp_json_encode($rum) . ";</script>\n";
        echo "<script async src=\"" . $src . "\"></script>\n";
    }

    /* ── First-party consent banner — INERT BY DEFAULT ───────────────────────
       Config in the 'seoagent_consent_banner' option (JSON):
         {"enabled":false,"cookie":"seoagent_consent","text":"…","accept":"Accept",
          "decline":"Decline","policyUrl":"…","policyLabel":"Privacy Policy"}
       Prints NOTHING unless enabled===true. Opt-in: sets seoagent_consent=statistics
       only on Accept (=denied on Decline). Honours GPC/DNT (silently declines, never
       shows). Self-contained (no deps); the beacon then gates on the cookie. */
    public function output_consent_banner() {
        if (is_admin() || is_feed()) return;
        $raw = get_option('seoagent_consent_banner', '');
        if ($raw === '' || $raw === false) return;
        $cfg = json_decode((string) $raw, true);
        if (!is_array($cfg) || ($cfg['enabled'] ?? null) !== true) return;   // INERT unless enabled
        $cookie = isset($cfg['cookie']) ? preg_replace('/[^A-Za-z0-9_-]/', '', (string) $cfg['cookie']) : 'seoagent_consent';
        if ($cookie === '') { $cookie = 'seoagent_consent'; }
        $text    = isset($cfg['text'])    && $cfg['text']    !== '' ? (string) $cfg['text']    : 'We use privacy-friendly analytics to understand how this site is used and improve it. No personal data, session recording, or cross-site tracking.';
        $accept  = isset($cfg['accept'])  && $cfg['accept']  !== '' ? (string) $cfg['accept']  : 'Accept';
        $decline = isset($cfg['decline']) && $cfg['decline'] !== '' ? (string) $cfg['decline'] : 'Decline';
        $label   = isset($cfg['policyLabel']) && $cfg['policyLabel'] !== '' ? (string) $cfg['policyLabel'] : 'Privacy Policy';
        $policy  = isset($cfg['policyUrl']) ? esc_url((string) $cfg['policyUrl']) : '';
        ?>
<style id="seoagent-consent-css">
#seoagent-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483646;max-width:560px;margin:0 auto;background:#fff;color:#1a1a1a;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.18);padding:18px 20px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:none}
#seoagent-consent.on{display:block}
#seoagent-consent p{margin:0 0 14px}
#seoagent-consent a{color:#0a8f5b;text-decoration:underline}
#seoagent-consent .sa-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
#seoagent-consent button{cursor:pointer;border:0;border-radius:9px;padding:10px 18px;font-weight:600;font-size:13.5px;line-height:1}
#seoagent-consent .sa-acc{background:#0a8f5b;color:#fff}
#seoagent-consent .sa-dec{background:#ececec;color:#333}
@media (prefers-color-scheme:dark){#seoagent-consent{background:#1e1e1e;color:#eee}#seoagent-consent .sa-dec{background:#333;color:#ddd}}
</style>
<div id="seoagent-consent" role="dialog" aria-live="polite" aria-label="Privacy consent">
  <p><?php echo esc_html($text); ?><?php if ($policy) { ?> <a href="<?php echo $policy; ?>" rel="nofollow"><?php echo esc_html($label); ?></a><?php } ?></p>
  <div class="sa-row">
    <button type="button" class="sa-dec" id="seoagent-consent-dec"><?php echo esc_html($decline); ?></button>
    <button type="button" class="sa-acc" id="seoagent-consent-acc"><?php echo esc_html($accept); ?></button>
  </div>
</div>
<script>
(function(){try{
  var NAME=<?php echo wp_json_encode($cookie); ?>;
  function get(n){var m=document.cookie.match('(?:^|; )'+n.replace(/([.*+?^${}()|[\]\\])/g,'\\$1')+'=([^;]*)');return m?m[1]:null;}
  function set(v){try{document.cookie=NAME+'='+v+';max-age=31536000;path=/;samesite=Lax'+(location.protocol==='https:'?';secure':'');}catch(e){}}
  var nav=navigator||{};
  if(nav.globalPrivacyControl===true||nav.doNotTrack==='1'||window.doNotTrack==='1'){ if(!get(NAME)){ set('denied'); } return; }
  if(get(NAME)){ return; }
  var el=document.getElementById('seoagent-consent'); if(!el){ return; }
  el.className='on';
  function close(v){ set(v); el.className=''; }
  var a=document.getElementById('seoagent-consent-acc'), d=document.getElementById('seoagent-consent-dec');
  if(a){ a.addEventListener('click',function(){ close('statistics'); }); }
  if(d){ d.addEventListener('click',function(){ close('denied'); }); }
}catch(e){}})();
</script>
        <?php
    }

    /* Mark 404 responses so the beacon (and crawlers) can detect soft/hard 404s. */
    public function output_404_marker() {
        if (is_404()) echo "\n<meta name=\"sentinel-404\" content=\"1\">\n";
    }

    /* Clear page caches so applied changes show immediately (not on cache expiry). */
    private function purge() {
        if (function_exists('rocket_clean_domain')) rocket_clean_domain();
        if (function_exists('rocket_clean_minify')) rocket_clean_minify();
        if (function_exists('w3tc_flush_all')) w3tc_flush_all();
        if (has_action('litespeed_purge_all')) do_action('litespeed_purge_all');
        if (function_exists('wp_cache_flush')) wp_cache_flush();
    }

    /* ── REST: let the agent store schema / CSS ─────────────────────────────── */
    public function routes() {
        $perm = function () { return current_user_can('edit_posts'); };

        register_rest_route('seoagent/v1', '/schema', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $p = $req->get_json_params();
                $id = (int) ($p['post_id'] ?? 0);
                if (!$id) return new WP_Error('no_id', 'post_id required', ['status' => 400]);
                $jsonld = $p['jsonld'] ?? '';
                if ($jsonld === '' || $jsonld === null) {
                    delete_post_meta($id, '_seoagent_jsonld');
                } else {
                    $val = is_array($jsonld) ? wp_json_encode($jsonld) : (string) $jsonld;
                    update_post_meta($id, '_seoagent_jsonld', wp_slash($val));
                }
                $this->purge();
                return ['ok' => true, 'post_id' => $id];
            },
        ]);

        register_rest_route('seoagent/v1', '/css', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $p = $req->get_json_params();
                update_option('seoagent_custom_css', (string) ($p['css'] ?? ''));
                $this->purge();
                return ['ok' => true, 'bytes' => strlen((string) ($p['css'] ?? ''))];
            },
        ]);

        // UX beacon (RUM) config — stores the JSON config that arms/disarms the
        // consent-gated loader (output_ux_beacon). Default absent = INERT.
        register_rest_route('seoagent/v1', '/set-ux-beacon', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $cfg = $req->get_json_params()['config'] ?? null;
                if ($cfg === null) return new WP_Error('bad', 'config required', ['status' => 400]);
                update_option('seoagent_ux_beacon', wp_json_encode($cfg));
                $this->purge();
                return ['ok' => true, 'armed' => !empty($cfg['armed'])];
            },
        ]);

        // First-party consent banner config (output_consent_banner). Absent = INERT.
        register_rest_route('seoagent/v1', '/set-consent-banner', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $cfg = $req->get_json_params()['config'] ?? null;
                if ($cfg === null) return new WP_Error('bad', 'config required', ['status' => 400]);
                update_option('seoagent_consent_banner', wp_json_encode($cfg));
                $this->purge();
                return ['ok' => true, 'enabled' => !empty($cfg['enabled'])];
            },
        ]);

        // Store/merge original-URL → WebP-URL mappings (set by the optimizer).
        register_rest_route('seoagent/v1', '/webp-map', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $p = $req->get_json_params();
                $incoming = isset($p['map']) && is_array($p['map']) ? $p['map'] : [];
                if (!empty($p['reset'])) { $map = []; } else { $map = get_option('seoagent_webp_map', []); if (!is_array($map)) $map = []; }
                foreach ($incoming as $orig => $webp) { if ($orig && $webp) $map[$orig] = $webp; }
                // Cap to avoid unbounded growth.
                if (count($map) > 5000) $map = array_slice($map, -5000, null, true);
                update_option('seoagent_webp_map', $map, false);
                $this->purge();
                return ['ok' => true, 'count' => count($map)];
            },
        ]);

        // Insert an internal/external link into a page — handles BOTH standard
        // post_content AND Elementor's _elementor_data (which lives outside the
        // standard field), then clears Elementor's CSS cache so it renders live.
        register_rest_route('seoagent/v1', '/insert-link', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $p = $req->get_json_params();
                $id = (int) ($p['post_id'] ?? 0);
                $anchor = trim((string) ($p['anchor'] ?? ''));
                $href = trim((string) ($p['target_url'] ?? ''));
                if (!$id || $anchor === '' || $href === '') return new WP_Error('bad', 'post_id, anchor, target_url required', ['status' => 400]);

                // CRITICAL: an Elementor page RENDERS from _elementor_data, not
                // post_content (which is just a hidden fallback copy). So if the page
                // has Elementor data, edit THAT — editing post_content would "verify"
                // but never appear on the live page.
                $data = get_post_meta($id, '_elementor_data', true);
                if (!empty($data)) {
                    $arr = is_string($data) ? json_decode($data, true) : $data;
                    if (is_array($arr)) {
                        $done = false; $exists = false;
                        seoagent_walk_elementor($arr, $anchor, $href, $done, $exists);
                        if ($done) {
                            update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($arr)));
                            delete_post_meta($id, '_elementor_css');
                            if (class_exists('\\Elementor\\Plugin')) { try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {} }
                            $this->purge();
                            return ['ok' => true, 'mode' => 'elementor', 'post_id' => $id];
                        }
                        // Anchor present but already inside a link → idempotent success (not a failure).
                        if ($exists) return ['ok' => true, 'mode' => 'exists', 'post_id' => $id];
                    }
                    return ['ok' => false, 'mode' => 'not_found', 'reason' => 'Anchor text not found in this page’s Elementor widgets (it may be in a button/linked element, or a global header/footer).'];
                }
                // Classic / Gutenberg page → post_content is what renders.
                $post = get_post($id);
                if ($post && trim((string) $post->post_content) !== '') {
                    list($nc, $changed, $why) = seoagent_insert_into_html($post->post_content, $anchor, $href);
                    if ($changed) { wp_update_post(['ID' => $id, 'post_content' => $nc]); $this->purge(); return ['ok' => true, 'mode' => 'content', 'post_id' => $id]; }
                    if ($why === 'exists') return ['ok' => true, 'mode' => 'exists', 'post_id' => $id];
                }
                return ['ok' => false, 'mode' => 'not_found', 'reason' => 'Anchor text not found in the page content.'];
            },
        ]);

        // Content-decay REFRESH: prepend (or replace, or remove) a marked
        // "freshness" block at the TOP of the page. Elementor-aware — on a builder
        // page it inserts an HTML widget as the first section (which actually
        // renders), exactly like /insert-link edits _elementor_data not post_content.
        register_rest_route('seoagent/v1', '/refresh-block', [
            'methods'  => 'POST',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $p = $req->get_json_params();
                $id = (int) ($p['post_id'] ?? 0);
                if (!$id) return new WP_Error('bad', 'post_id required', ['status' => 400]);
                $open = (string) ($p['open'] ?? '<!--seoagent-refresh-->');
                $close = (string) ($p['close'] ?? '<!--/seoagent-refresh-->');
                $remove = !empty($p['remove']);
                $marked = $open . "\n" . ((string) ($p['block_html'] ?? '')) . "\n" . $close;
                $re = '#<!--seoagent-refresh-->.*?<!--/seoagent-refresh-->\s*#s';

                // Elementor page → edit _elementor_data (that's what renders).
                $data = get_post_meta($id, '_elementor_data', true);
                if (!empty($data)) {
                    $arr = is_string($data) ? json_decode($data, true) : $data;
                    if (!is_array($arr)) $arr = [];
                    $before = count($arr);
                    // Drop any prior refresh section (makes apply idempotent + powers undo).
                    $arr = array_values(array_filter($arr, function ($el) { return strpos(wp_json_encode($el), 'seoagent-refresh') === false; }));
                    $replaced = count($arr) !== $before;
                    if (!$remove) array_unshift($arr, seoagent_refresh_section($marked));
                    update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($arr)));
                    delete_post_meta($id, '_elementor_css');
                    if (class_exists('\\Elementor\\Plugin')) { try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {} }
                    $this->purge();
                    return ['ok' => true, 'mode' => 'elementor', 'post_id' => $id, 'replaced' => $replaced, 'removed' => $remove];
                }
                // Classic / Gutenberg → post_content is what renders.
                $post = get_post($id);
                $content = $post ? (string) $post->post_content : '';
                $had = (bool) preg_match($re, $content);
                $content = preg_replace($re, '', $content);
                if (!$remove) $content = $marked . "\n" . $content;
                wp_update_post(['ID' => $id, 'post_content' => $content]);
                $this->purge();
                return ['ok' => true, 'mode' => 'content', 'post_id' => $id, 'replaced' => $had, 'removed' => $remove];
            },
        ]);

        // Return a page's EDITABLE text (post_content + Elementor widget text) so
        // the agent only suggests link anchors that actually live in this page's
        // own content — not in global nav/footer/CTA blocks it can't edit.
        register_rest_route('seoagent/v1', '/page-text', [
            'methods'  => 'GET',
            'permission_callback' => $perm,
            'callback' => function ($req) {
                $id = (int) $req->get_param('post_id');
                if (!$id) return new WP_Error('no_id', 'post_id required', ['status' => 400]);
                // "units" = the individual linkable text segments at the SAME granularity
                // the inserter works (per field, per non-anchor text run). The agent must
                // validate an anchor against a SINGLE unit, so a suggestion shown can
                // always be inserted (no validate-pass/insert-fail).
                // Match the inserter: Elementor pages render from _elementor_data, so
                // collect units from there; classic pages from post_content.
                $units = [];
                $data = get_post_meta($id, '_elementor_data', true);
                if (!empty($data)) { $arr = is_string($data) ? json_decode($data, true) : $data; if (is_array($arr)) seoagent_collect_units($arr, $units); }
                else { $post = get_post($id); if ($post && trim((string) $post->post_content) !== '') seoagent_text_units($post->post_content, $units); }
                $units = array_values(array_unique(array_filter($units)));
                return ['ok' => true, 'post_id' => $id, 'builder' => ($data ? 'elementor' : 'classic'), 'text' => implode(' ', $units), 'units' => $units];
            },
        ]);

        // GEO: publish llms.txt content (served at /llms.txt by serve_llms_txt).
        register_rest_route('seoagent/v1', '/publish-llms-txt', [
            'methods' => 'POST', 'permission_callback' => $perm,
            'callback' => function ($req) {
                $content = (string) ($req->get_json_params()['content'] ?? '');
                update_option('seoagent_llms_txt', $content);
                $this->purge();
                return ['ok' => true, 'bytes' => strlen($content)];
            },
        ]);

        // GEO: publish AI-bot robots directives (merged into robots.txt by append_ai_robots).
        register_rest_route('seoagent/v1', '/publish-ai-robots', [
            'methods' => 'POST', 'permission_callback' => $perm,
            'callback' => function ($req) {
                $content = (string) ($req->get_json_params()['content'] ?? '');
                update_option('seoagent_ai_robots', $content);
                $this->purge();
                return ['ok' => true, 'bytes' => strlen($content), 'physicalRobots' => file_exists(ABSPATH . 'robots.txt')];
            },
        ]);

        register_rest_route('seoagent/v1', '/optimize-selftest', [
            'methods'  => 'GET',
            'permission_callback' => $perm,
            'callback' => function () {
                $uxRaw = get_option('seoagent_ux_beacon', '');
                $uxCfg = ($uxRaw !== '' && $uxRaw !== false) ? json_decode((string) $uxRaw, true) : null;
                $uxArmed = is_array($uxCfg) && (($uxCfg['armed'] ?? null) === true);
                $cbRaw = get_option('seoagent_consent_banner', '');
                $cbCfg = ($cbRaw !== '' && $cbRaw !== false) ? json_decode((string) $cbRaw, true) : null;
                $cbOn = is_array($cbCfg) && (($cbCfg['enabled'] ?? null) === true);
                return ['ok' => true, 'features' => ['webp_on_the_fly', 'jsonld', 'custom_css', 'insert_link', 'page_text', 'refresh_block', 'repeater_widgets', 'entity_tolerant_insert', 'multi_anchor_targets', 'meta_render', 'geo_publish', 'ux_beacon', 'consent_banner', 'self_update'], 'version' => self::VERSION, 'seo_plugin_owns_head' => $this->seo_plugin_owns_head(), 'ux_beacon_armed' => $uxArmed, 'consent_banner_enabled' => $cbOn];
            },
        ]);

        // SELF-UPDATE — replace this mu-plugin with a newer version pushed by the
        // authenticated backend. Hardened: ADMIN-ONLY; the code travels in the request
        // body (never fetched from a request-supplied URL); sha256 + header/class/size
        // checks; downgrade blocked; backup + loopback health-check + auto-rollback so a
        // bad file can't brick the site (on hosts where loopback is blocked it fails safe,
        // staying on the current version).
        register_rest_route('seoagent/v1', '/self-update', [
            'methods'  => 'POST',
            'permission_callback' => function () { return current_user_can('manage_options'); },
            'callback' => function ($req) {
                $p    = $req->get_json_params();
                $code = isset($p['code']) ? (string) $p['code'] : '';
                $ver  = isset($p['version']) ? (string) $p['version'] : '';
                $hash = isset($p['sha256']) ? strtolower((string) $p['sha256']) : '';
                if (strlen($code) < 5000) return new WP_Error('bad', 'code missing or too small', ['status' => 400]);
                if (hash('sha256', $code) !== $hash) return new WP_Error('hash', 'sha256 mismatch', ['status' => 400]);
                if (strpos($code, '<?php') !== 0) return new WP_Error('bad', 'not a PHP file', ['status' => 400]);
                if (strpos($code, 'Plugin Name: SEO Agent') === false || strpos($code, 'class SEO_Agent_Optimize') === false) return new WP_Error('bad', 'not the SEO Agent plugin', ['status' => 400]);
                if ($ver === '' || version_compare($ver, self::VERSION, '<')) return new WP_Error('ver', 'refusing downgrade (' . $ver . ' < ' . self::VERSION . ')', ['status' => 400]);
                $file = __FILE__;
                if (!is_writable($file)) return new WP_Error('perm', 'plugin file not writable on this host — update manually', ['status' => 500]);
                $current = @file_get_contents($file);
                if ($current === false) return new WP_Error('read', 'could not read current plugin', ['status' => 500]);
                if (@file_put_contents($file, $code) === false) return new WP_Error('write', 'write failed', ['status' => 500]);
                // Loopback: a FRESH request loads the NEW code. THIS request still runs the
                // OLD code in memory, so if the new file fatals we restore the backup here.
                $resp = wp_remote_get(add_query_arg('seoagent_uphc', (string) time(), home_url('/')), ['timeout' => 15, 'redirection' => 1, 'sslverify' => false, 'headers' => ['Cache-Control' => 'no-cache']]);
                $rc = is_wp_error($resp) ? 0 : (int) wp_remote_retrieve_response_code($resp);
                if ($rc <= 0 || $rc >= 500) {
                    @file_put_contents($file, $current);   // ROLLBACK — new version unhealthy
                    return new WP_Error('health', 'new version failed health-check (HTTP ' . $rc . ') — rolled back to ' . self::VERSION, ['status' => 500]);
                }
                return ['ok' => true, 'updated_to' => $ver, 'health' => $rc];
            },
        ]);
    }
}

/* ── link-insertion helpers (used by /insert-link) ───────────────────────────
   Insert <a href> at the first PLAIN-TEXT occurrence of $anchor — never nesting
   inside an existing <a> and never if the target is already linked. */
// Build the anchor match pattern: whitespace/&nbsp;-tolerant, entity-tolerant
// (so a decoded anchor "R&D" matches raw "R&amp;D"), boundary via lookaround so a
// WHOLE-field anchor (heading/CTA at end-of-string) still matches.
// Build a top-level Elementor section holding a single HTML widget — used to
// render the content-decay "freshness" block on builder pages. IDs are random
// 7-char hex (Elementor's convention); settings={} so it inherits the theme.
function seoagent_refresh_section($html) {
    $rid = function () { return substr(md5(uniqid('', true)), 0, 7); };
    return [
        'id' => $rid(), 'elType' => 'section', 'settings' => new stdClass(), 'isInner' => false,
        'elements' => [[
            'id' => $rid(), 'elType' => 'column', 'isInner' => false,
            'settings' => ['_column_size' => 100, '_inline_size' => null],
            'elements' => [[
                'id' => $rid(), 'elType' => 'widget', 'widgetType' => 'html',
                'settings' => ['html' => $html], 'elements' => [],
            ]],
        ]],
    ];
}

function seoagent_anchor_regex($anchor) {
    $q = preg_quote($anchor, '/');
    // Whitespace token tolerates ASCII space, &nbsp; (raw entity or decoded U+00A0),
    // and typographic spaces (en/em/narrow/ideographic) — PHP \s under /u is ASCII-only,
    // so list them explicitly. Keeps the inserter matching what page-text decoded.
    $q = str_replace(' ', '(?:[\\s\\x{00a0}\\x{2000}-\\x{200a}\\x{202f}\\x{205f}\\x{3000}]|&nbsp;|&#0*160;)+', $q);
    $q = str_replace('&', '(?:&|&amp;)', $q);            // must run BEFORE the entity tokens below
    $q = str_replace('"', '(?:"|&quot;|&#0*34;)', $q);
    $q = str_replace("'", "(?:'|&#0*39;|&apos;|&#x27;)", $q);
    return '/(^|[^\\p{L}\\p{N}])(' . $q . ')(?![\\p{L}\\p{N}])/iu';
}

function seoagent_insert_into_html($html, $anchor, $href) {
    if ($html === null || $html === '') return [$html, false, 'empty'];
    $eh = esc_url($href);
    $parts = preg_split('/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
    if (!$parts) return [$html, false, 'not_found'];
    $re = seoagent_anchor_regex($anchor);
    $enc = function ($s) { return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s); };
    // Entity-tolerant "does this run contain the anchor?" (matches what page-text decodes).
    $matches = function ($s) use ($re) {
        if (preg_match($re, $s)) return true;
        $d = html_entity_decode($s, ENT_QUOTES | ENT_HTML5);
        return ($d !== $s && preg_match($re, $d)) ? 1 : 0;
    };
    // Insert at the first PLAIN-TEXT occurrence of the anchor. We intentionally do NOT
    // bail just because the TARGET url is already linked elsewhere in this field —
    // linking a DIFFERENT anchor to an already-linked page is valid and common (it's
    // why "peer-reviewed scientific research" and "trusted public health sources" can
    // BOTH point to /definitions/). We only report 'exists' (idempotent no-op) when the
    // ANCHOR ITSELF is already inside a link, so re-applying a done suggestion stays a
    // clean success instead of a misleading "not found" / "Add in editor".
    $depth = 0;                                          // never insert inside an (even unclosed) <a>
    $seenLinked = false;                                 // the anchor occurs, but already inside an <a>
    foreach ($parts as $i => $seg) {
        if ($seg === '') continue;
        if ($seg[0] === '<') {
            if (preg_match('/^<a\b/i', $seg)) {
                if (stripos($seg, '</a') === false) $depth++;          // unclosed <a> → following runs are linked
                elseif ($matches($seg)) $seenLinked = true;            // self-contained <a>…anchor…</a>
            } elseif (preg_match('/^<\/a\b/i', $seg) && $depth > 0) $depth--;
            continue;
        }
        if ($depth > 0) { if ($matches($seg)) $seenLinked = true; continue; }
        // FAST PATH: match the raw segment (preserves the original encoding exactly).
        if (preg_match($re, $seg)) {
            $parts[$i] = preg_replace_callback($re, function ($m) use ($eh) {
                return $m[1] . '<a href="' . $eh . '">' . $m[2] . '</a>';
            }, $seg, 1);
            return [implode('', $parts), true, ''];
        }
        // FALLBACK: the raw didn't match, but its DECODED form might — the SAME transform
        // seoagent_text_units() applies, so the inserter places EXACTLY what page-text
        // validated (typographic entities from AI/pasted content: en-dash &#8211;, smart
        // quote &#8217;, &hellip;…). Rebuild the run from the decoded form (HTML-significant
        // &<> re-encoded), which renders identically.
        $dec = html_entity_decode($seg, ENT_QUOTES | ENT_HTML5);
        $dec = str_replace("\xC2\xA0", ' ', $dec);
        if ($dec !== $seg && preg_match($re, $dec, $mm, PREG_OFFSET_CAPTURE)) {
            $aStart = $mm[2][1];           // byte offset of the anchor (boundary char stays in $before)
            $aText  = $mm[2][0];
            $before = substr($dec, 0, $aStart);
            $after  = substr($dec, $aStart + strlen($aText));
            $parts[$i] = $enc($before) . '<a href="' . $eh . '">' . $enc($aText) . '</a>' . $enc($after);
            return [implode('', $parts), true, ''];
        }
    }
    return [$html, false, $seenLinked ? 'exists' : 'not_found'];
}

// Split one HTML string into the decoded, linkable text units (mirrors the
// inserter exactly: per non-anchor text run, skipping content inside <a>), so
// page-text validation agrees with what /insert-link can do. NOTE: this decodes
// entities; the inserter (seoagent_insert_into_html) has a matching decoded
// fallback so a unit surfaced here is ALWAYS insertable — no validate/insert gap.
function seoagent_text_units($html, &$units) {
    if (!is_string($html) || $html === '') return;
    $parts = preg_split('/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
    if (!$parts) return;
    $depth = 0;
    foreach ($parts as $seg) {
        if ($seg === '') continue;
        if ($seg[0] === '<') {
            if (preg_match('/^<a\b/i', $seg) && stripos($seg, '</a') === false) $depth++;
            elseif (preg_match('/^<\/a\b/i', $seg) && $depth > 0) $depth--;
            continue;
        }
        if ($depth > 0) continue;
        $t = html_entity_decode(wp_strip_all_tags($seg), ENT_QUOTES | ENT_HTML5);
        $t = str_replace("\xC2\xA0", ' ', $t);
        $t = trim(preg_replace('/\s+/u', ' ', $t));
        if ($t !== '') $units[] = $t;
    }
}

// Text-bearing Elementor widget settings we may edit/scan (kept in ONE place so
// insertion and validation always agree). Includes repeater-item fields (icon-list
// 'text', tabs/accordion 'tab_title'/'tab_content') which v1.6.1 now reaches.
function seoagent_text_fields() {
    return ['editor', 'title', 'text', 'description', 'content', 'tab_content', 'tab_title', 'item_text',
            'item_description', 'description_text', 'title_text', 'heading_title', 'testimonial_content',
            'blockquote_content', 'alert_title', 'alert_description', 'caption'];
}
// A widget that is itself a link (button, or any widget with a link URL) — wrapping
// its text would create nested <a>, so we never insert into / suggest those.
function seoagent_widget_is_linked($el) {
    $wt = isset($el['widgetType']) ? $el['widgetType'] : '';
    if ($wt === 'button') return true;
    foreach (['link', 'button_link'] as $lk) {
        if (isset($el['settings'][$lk]['url']) && $el['settings'][$lk]['url'] !== '') return true;
    }
    return false;
}

/* Walk ONE widget's settings (incl. nested repeater arrays — icon-list, tabs,
   accordion, price-list…) and insert the link into the first text field (from
   seoagent_text_fields) that contains the anchor. Skips any sub-item that is
   itself a link (link.url set) to avoid nesting <a>. v1.6.1. */
function seoagent_walk_settings(&$settings, $anchor, $href, &$done, &$exists) {
    if ($done || !is_array($settings)) return;
    $fields = seoagent_text_fields();
    foreach ($settings as $k => &$v) {
        if ($done) return;
        if (is_string($v) && $v !== '' && in_array($k, $fields, true)) {
            list($nh, $changed, $why) = seoagent_insert_into_html($v, $anchor, $href);
            if ($changed) { $v = $nh; $done = true; return; }
            if ($why === 'exists') $exists = true;   // anchor already linked here → remember (idempotent)
        } elseif (is_array($v)) {
            if (isset($v['link']['url']) && $v['link']['url'] !== '') continue;   // linked repeater item → skip
            seoagent_walk_settings($v, $anchor, $href, $done, $exists);
        }
    }
    unset($v);
}
/* Same recursion, read-only: collect linkable text units. */
function seoagent_collect_settings_units($settings, &$units) {
    if (!is_array($settings)) return;
    $fields = seoagent_text_fields();
    foreach ($settings as $k => $v) {
        if (is_string($v) && $v !== '' && in_array($k, $fields, true)) seoagent_text_units($v, $units);
        elseif (is_array($v)) {
            if (isset($v['link']['url']) && $v['link']['url'] !== '') continue;
            seoagent_collect_settings_units($v, $units);
        }
    }
}

/* Recursively walk Elementor's element tree; insert the link into the first
   text-bearing widget setting (incl. repeater items) that contains the anchor. */
function seoagent_walk_elementor(&$els, $anchor, $href, &$done, &$exists) {
    if ($done || !is_array($els)) return;
    foreach ($els as &$el) {
        if ($done) return;
        if (!empty($el['settings']) && is_array($el['settings']) && !seoagent_widget_is_linked($el)) {
            seoagent_walk_settings($el['settings'], $anchor, $href, $done, $exists);
        }
        if (!$done && !empty($el['elements']) && is_array($el['elements'])) {
            seoagent_walk_elementor($el['elements'], $anchor, $href, $done, $exists);
        }
    }
}

/* Recursively collect the linkable text UNITS of Elementor widgets (same fields
   /insert-link edits, incl. repeater items, skipping linked widgets) so
   validation agrees exactly with insertion. */
function seoagent_collect_units($els, &$units) {
    if (!is_array($els)) return;
    foreach ($els as $el) {
        if (!empty($el['settings']) && is_array($el['settings']) && !seoagent_widget_is_linked($el)) {
            seoagent_collect_settings_units($el['settings'], $units);
        }
        if (!empty($el['elements']) && is_array($el['elements'])) seoagent_collect_units($el['elements'], $units);
    }
}

new SEO_Agent_Optimize();
