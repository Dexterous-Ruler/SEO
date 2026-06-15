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
 * Version:     1.6.0
 * Author:      wp-seo-agent
 *
 * INSTALL: copy to wp-content/mu-plugins/ (create the folder if it doesn't exist).
 *          mu-plugins auto-activate and can't be turned off by accident.
 */

if (!defined('ABSPATH')) { exit; }

class SEO_Agent_Optimize {

    public function __construct() {
        add_action('template_redirect', [$this, 'start_webp_buffer'], 1);
        add_action('wp_head', [$this, 'output_jsonld'], 99);
        add_action('wp_head', [$this, 'output_css'], 100);
        add_action('rest_api_init', [$this, 'routes']);
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
                        $done = false;
                        seoagent_walk_elementor($arr, $anchor, $href, $done);
                        if ($done) {
                            update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($arr)));
                            delete_post_meta($id, '_elementor_css');
                            if (class_exists('\\Elementor\\Plugin')) { try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {} }
                            $this->purge();
                            return ['ok' => true, 'mode' => 'elementor', 'post_id' => $id];
                        }
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

        register_rest_route('seoagent/v1', '/optimize-selftest', [
            'methods'  => 'GET',
            'permission_callback' => $perm,
            'callback' => function () {
                return ['ok' => true, 'features' => ['webp_on_the_fly', 'jsonld', 'custom_css', 'insert_link', 'page_text', 'refresh_block'], 'version' => '1.6.0'];
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
    $q = str_replace(' ', '(?:\\s|&nbsp;|&#0*160;)+', $q);
    $q = str_replace('&', '(?:&|&amp;)', $q);            // must run BEFORE the entity tokens below
    $q = str_replace('"', '(?:"|&quot;|&#0*34;)', $q);
    $q = str_replace("'", "(?:'|&#0*39;|&apos;|&#x27;)", $q);
    return '/(^|[^\\p{L}\\p{N}])(' . $q . ')(?![\\p{L}\\p{N}])/iu';
}

function seoagent_insert_into_html($html, $anchor, $href) {
    if ($html === null || $html === '') return [$html, false, 'empty'];
    $eh = esc_url($href);
    foreach (array_unique([$href, $eh]) as $h) {        // idempotency: raw OR esc_url'd form already linked
        if ($h !== '' && (strpos($html, 'href="' . $h . '"') !== false || strpos($html, "href='" . $h . "'") !== false)) return [$html, false, 'exists'];
    }
    $parts = preg_split('/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
    if (!$parts) return [$html, false, 'not_found'];
    $re = seoagent_anchor_regex($anchor);
    $depth = 0;                                          // never insert inside an (even unclosed) <a>
    foreach ($parts as $i => $seg) {
        if ($seg === '') continue;
        if ($seg[0] === '<') {
            if (preg_match('/^<a\b/i', $seg) && stripos($seg, '</a') === false) $depth++;
            elseif (preg_match('/^<\/a\b/i', $seg) && $depth > 0) $depth--;
            continue;
        }
        if ($depth > 0) continue;
        if (preg_match($re, $seg)) {
            $parts[$i] = preg_replace_callback($re, function ($m) use ($eh) {
                return $m[1] . '<a href="' . $eh . '">' . $m[2] . '</a>';
            }, $seg, 1);
            return [implode('', $parts), true, ''];
        }
    }
    return [$html, false, 'not_found'];
}

// Split one HTML string into the decoded, linkable text units (mirrors the
// inserter exactly: per non-anchor text run, skipping content inside <a>), so
// page-text validation agrees byte-for-byte with what /insert-link can do.
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
// insertion and validation always agree).
function seoagent_text_fields() {
    return ['editor', 'title', 'text', 'description', 'content', 'tab_content', 'item_description',
            'description_text', 'title_text', 'heading_title', 'testimonial_content', 'blockquote_content',
            'alert_title', 'alert_description', 'caption'];
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

/* Recursively walk Elementor's element tree; insert the link into the first
   HTML-bearing widget setting that contains the anchor text. */
function seoagent_walk_elementor(&$els, $anchor, $href, &$done) {
    if ($done || !is_array($els)) return;
    $fields = seoagent_text_fields();
    foreach ($els as &$el) {
        if ($done) return;
        if (!empty($el['settings']) && is_array($el['settings']) && !seoagent_widget_is_linked($el)) {
            foreach ($fields as $k) {
                if (isset($el['settings'][$k]) && is_string($el['settings'][$k]) && $el['settings'][$k] !== '') {
                    list($nh, $changed) = seoagent_insert_into_html($el['settings'][$k], $anchor, $href);
                    if ($changed) { $el['settings'][$k] = $nh; $done = true; break; }
                }
            }
        }
        if (!$done && !empty($el['elements']) && is_array($el['elements'])) {
            seoagent_walk_elementor($el['elements'], $anchor, $href, $done);
        }
    }
}

/* Recursively collect the linkable text UNITS of Elementor widgets (same fields
   /insert-link edits, skipping linked widgets, split per text-run via
   seoagent_text_units) so validation agrees exactly with insertion. */
function seoagent_collect_units($els, &$units) {
    if (!is_array($els)) return;
    $fields = seoagent_text_fields();
    foreach ($els as $el) {
        if (!empty($el['settings']) && is_array($el['settings']) && !seoagent_widget_is_linked($el)) {
            foreach ($fields as $k) {
                if (isset($el['settings'][$k]) && is_string($el['settings'][$k]) && $el['settings'][$k] !== '') {
                    seoagent_text_units($el['settings'][$k], $units);
                }
            }
        }
        if (!empty($el['elements']) && is_array($el['elements'])) seoagent_collect_units($el['elements'], $units);
    }
}

new SEO_Agent_Optimize();
