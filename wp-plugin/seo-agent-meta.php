<?php
/**
 * Plugin Name: SEO Agent — Meta Bridge & Approval Queue
 * Description: Companion for wp-seo-agent on go-legal.ai. Registers Rank Math's
 *              meta keys for the REST API (so the agent can WRITE them and Rank
 *              Math keeps RENDERING them — no duplicate tags), and provides a
 *              human approval-queue admin screen. Does NOT output any <head> tags.
 * Version:     2.0.0
 * Author:      wp-seo-agent
 *
 * INSTALL: copy to wp-content/mu-plugins/ (create folder if needed). mu-plugins
 * auto-activate and can't be disabled by accident.
 *
 * WHY THIS EXISTS (the silent-failure trap):
 * A POST to /wp/v2/posts/{id} with an UNREGISTERED meta key returns 200 OK but
 * silently DISCARDS the value. Registering the keys below makes writes actually
 * stick. The agent still verifies every write with a follow-up read.
 *
 * RANK MATH OWNS <head>. This plugin never renders meta/canonical/schema — it
 * only exposes Rank Math's storage to REST. No collision, no duplication.
 */

if (!defined('ABSPATH')) { exit; }

class SEO_Agent_Meta_Bridge {

    /** Rank Math meta keys (confirmed by Rank Math support + plugin source). */
    const RANK_MATH_KEYS = [
        'rank_math_title'         => 'string',
        'rank_math_description'   => 'string',
        'rank_math_focus_keyword' => 'string',
        'rank_math_canonical_url' => 'string',
        'rank_math_robots'        => 'array',   // Rank Math stores robots as an array
    ];

    const QUEUE_TABLE = 'seoagent_queue';

    public function __construct() {
        add_action('init', [$this, 'register_meta']);
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('rest_api_init', [$this, 'register_routes']);
        register_activation_hook(__FILE__, [$this, 'install_table']); // no-op for mu, kept for parity
    }

    /**
     * Register Rank Math keys for REST on BOTH posts and pages.
     * (Companion plugins like Devora's exclude pages — we cover pages here.)
     */
    public function register_meta() {
        $auth = function () { return current_user_can('edit_posts'); };
        foreach (self::RANK_MATH_KEYS as $key => $type) {
            foreach (['post', 'page'] as $obj) {
                register_post_meta($obj, $key, [
                    'type'          => $type === 'array' ? 'array' : 'string',
                    'single'        => true,
                    'show_in_rest'  => $type === 'array'
                        ? ['schema' => ['type' => 'array', 'items' => ['type' => 'string']]]
                        : true,
                    'auth_callback' => $auth,
                ]);
            }
        }
    }

    /** Create the approval-queue table (idempotent). */
    public function install_table() {
        global $wpdb;
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        $charset = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            object_type VARCHAR(20) NOT NULL DEFAULT 'post',
            meta_key VARCHAR(100) NOT NULL,
            old_value LONGTEXT NULL,
            new_value LONGTEXT NULL,
            phase VARCHAR(40) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            applied_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY status (status),
            KEY post_id (post_id)
        ) {$charset};");
    }

    public function admin_menu() {
        add_menu_page(
            'SEO Agent Queue', 'SEO Agent', 'edit_posts',
            'seoagent-queue', [$this, 'render_queue'], 'dashicons-search', 80
        );
    }

    /** REST routes the agent uses to enqueue proposed changes + read status. */
    public function register_routes() {
        register_rest_route('seoagent/v1', '/queue', [
            [
                'methods'  => 'POST',
                'callback' => [$this, 'rest_enqueue'],
                'permission_callback' => function () { return current_user_can('edit_posts'); },
            ],
            [
                'methods'  => 'GET',
                'callback' => [$this, 'rest_list_queue'],
                'permission_callback' => function () { return current_user_can('edit_posts'); },
            ],
        ]);
        // Confirms Rank Math getHead is reachable (agent calls this in wp:check).
        register_rest_route('seoagent/v1', '/selftest', [
            'methods'  => 'GET',
            'callback' => [$this, 'rest_selftest'],
            'permission_callback' => function () { return current_user_can('edit_posts'); },
        ]);
        // Purge caches after CLI/REST writes (WP Rocket + core object cache).
        register_rest_route('seoagent/v1', '/purge-cache', [
            'methods'  => 'POST',
            'callback' => [$this, 'rest_purge_cache'],
            'permission_callback' => function () { return current_user_can('edit_posts'); },
        ]);
    }

    /** Clear page/minify caches so re-verify reads fresh HTML, not stale cache. */
    public function rest_purge_cache($req) {
        $cleared = [];
        if (function_exists('rocket_clean_domain')) { rocket_clean_domain(); $cleared[] = 'rocket_domain'; }
        if (function_exists('rocket_clean_minify')) { rocket_clean_minify(); $cleared[] = 'rocket_minify'; }
        if (function_exists('wp_cache_flush')) { wp_cache_flush(); $cleared[] = 'object_cache'; }
        // Common third-party caches (best-effort, only if present).
        if (function_exists('w3tc_flush_all')) { w3tc_flush_all(); $cleared[] = 'w3tc'; }
        if (has_action('litespeed_purge_all')) { do_action('litespeed_purge_all'); $cleared[] = 'litespeed'; }
        return rest_ensure_response(['ok' => true, 'cleared' => $cleared]);
    }

    public function rest_enqueue($req) {
        $this->install_table();
        global $wpdb;
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        $items = $req->get_json_params()['items'] ?? [];
        $n = 0;
        foreach ($items as $it) {
            if (empty($it['post_id']) || empty($it['meta_key'])) continue;
            $old = get_post_meta((int)$it['post_id'], $it['meta_key'], true);
            $wpdb->insert($table, [
                'post_id'     => (int)$it['post_id'],
                'object_type' => $it['object_type'] ?? 'post',
                'meta_key'    => $it['meta_key'],
                'old_value'   => maybe_serialize($old),
                'new_value'   => maybe_serialize($it['new_value'] ?? ''),
                'phase'       => $it['phase'] ?? null,
                'status'      => 'pending',
            ]);
            $n++;
        }
        return ['enqueued' => $n];
    }

    public function rest_list_queue($req) {
        $this->install_table();
        global $wpdb;
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        $status = $req->get_param('status') ?: 'pending';
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE status=%s ORDER BY id DESC LIMIT 500", $status));
        return ['items' => $rows];
    }

    public function rest_selftest() {
        return [
            'ok' => true,
            'rank_math_active' => class_exists('RankMath') || defined('RANK_MATH_VERSION'),
            'registered_keys' => array_keys(self::RANK_MATH_KEYS),
            'covers_pages' => true,
        ];
    }

    /** wp-admin approval screen: approve/reject pending changes, then apply. */
    public function render_queue() {
        $this->install_table();
        global $wpdb;
        $table = $wpdb->prefix . self::QUEUE_TABLE;

        // Handle approve/reject/apply actions.
        if (!empty($_POST['seoagent_action']) && check_admin_referer('seoagent_queue')) {
            $ids = array_map('intval', $_POST['ids'] ?? []);
            $action = sanitize_text_field($_POST['seoagent_action']);
            if ($ids) {
                if ($action === 'approve') {
                    foreach ($ids as $id) {
                        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d", $id));
                        if (!$row) continue;
                        update_post_meta($row->post_id, $row->meta_key, maybe_unserialize($row->new_value));
                        // Verify-after-write (defeat the silent-failure trap).
                        $check = get_post_meta($row->post_id, $row->meta_key, true);
                        $ok = maybe_serialize($check) === $row->new_value;
                        $wpdb->update($table, [
                            'status' => $ok ? 'applied' : 'failed',
                            'applied_at' => current_time('mysql'),
                        ], ['id' => $id]);
                    }
                    // Clear WP Rocket cache after writes.
                    if (function_exists('rocket_clean_domain')) { rocket_clean_domain(); }
                    if (function_exists('rocket_clean_minify')) { rocket_clean_minify(); }
                } elseif ($action === 'reject') {
                    foreach ($ids as $id) $wpdb->update($table, ['status' => 'rejected'], ['id' => $id]);
                } elseif ($action === 'rollback') {
                    foreach ($ids as $id) {
                        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d", $id));
                        if (!$row || $row->status !== 'applied') continue;
                        update_post_meta($row->post_id, $row->meta_key, maybe_unserialize($row->old_value));
                        $wpdb->update($table, ['status' => 'rolledback'], ['id' => $id]);
                    }
                }
                echo '<div class="notice notice-success"><p>Done.</p></div>';
            }
        }

        $rows = $wpdb->get_results("SELECT * FROM {$table} WHERE status='pending' ORDER BY id DESC LIMIT 500");
        echo '<div class="wrap"><h1>SEO Agent — Approval Queue</h1>';
        echo '<p>Review proposed changes. Approving writes the value (and verifies it stuck), then clears WP Rocket cache. Everything is reversible via Rollback.</p>';
        echo '<form method="post">';
        wp_nonce_field('seoagent_queue');
        echo '<table class="widefat striped"><thead><tr><th></th><th>Post</th><th>Field</th><th>Old</th><th>New</th><th>Phase</th></tr></thead><tbody>';
        if (!$rows) echo '<tr><td colspan="6">No pending changes.</td></tr>';
        foreach ($rows as $r) {
            $title = get_the_title($r->post_id);
            printf(
                '<tr><td><input type="checkbox" name="ids[]" value="%d"></td><td>#%d %s</td><td><code>%s</code></td><td>%s</td><td><strong>%s</strong></td><td>%s</td></tr>',
                $r->id, $r->post_id, esc_html($title), esc_html($r->meta_key),
                esc_html(mb_strimwidth((string)maybe_unserialize($r->old_value), 0, 60, '…')),
                esc_html(mb_strimwidth((string)maybe_unserialize($r->new_value), 0, 60, '…')),
                esc_html($r->phase)
            );
        }
        echo '</tbody></table><p>';
        echo '<button class="button button-primary" name="seoagent_action" value="approve">Approve & Apply</button> ';
        echo '<button class="button" name="seoagent_action" value="reject">Reject</button> ';
        echo '<button class="button" name="seoagent_action" value="rollback">Rollback (applied)</button>';
        echo '</p></form></div>';
    }
}

new SEO_Agent_Meta_Bridge();
