<?php
/**
 * SEO Agent — child-theme functions snippet for go-legal.ai
 *
 * INSTALL: append the body of this file (NOT the opening <?php if your
 * functions.php already has one) to the Hello Elementor CHILD theme's
 * functions.php. Deploy to STAGING first, verify, then publish.
 *
 * Covers: enqueue the a11y CSS, add a focusable skip link (A7),
 * add an accessible label to the search input (A4), and add role="main"
 * to the primary content container (A6).
 */

if (!defined('ABSPATH')) { exit; }

/* ---- Enqueue the accessibility stylesheet + JS patch --------------- */
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'seoagent-a11y',
        get_stylesheet_directory_uri() . '/seo-agent-a11y.css',
        [],
        '1.0.0'
    );
    // Footer JS that fixes Elementor ARIA/link-name issues site-wide.
    wp_enqueue_script(
        'seoagent-a11y',
        get_stylesheet_directory_uri() . '/seo-agent-a11y.js',
        [],
        '1.0.0',
        true // in footer
    );
}, 20);

/* ---- A7: focusable skip link as the first focusable element -------- */
add_action('wp_body_open', function () {
    echo '<a class="seoagent-skip-link" href="#content">Skip to main content</a>';
}, 1);

/* ---- A4 + A6: post-process output to add the search label and main
   landmark. Uses an output buffer on the front end only. Conservative:
   only adds attributes, never removes anything. ---------------------- */
add_action('template_redirect', function () {
    if (is_admin()) { return; }
    ob_start(function ($html) {
        if (!$html || stripos($html, '<body') === false) { return $html; }

        // A4: give the search input an accessible name (idempotent).
        if (strpos($html, 'id="search"') !== false && stripos($html, 'aria-label="Search"') === false) {
            $html = preg_replace(
                '/(<input[^>]*\bid="search")([^>]*>)/i',
                '$1 aria-label="Search"$2',
                $html,
                1
            );
        }

        // A6: ensure a main landmark exists. If no <main> and no role="main",
        // tag the first Elementor content container with role="main" + id.
        if (stripos($html, '<main') === false && stripos($html, 'role="main"') === false) {
            $html = preg_replace(
                '/(<div[^>]*class="[^"]*e-con-inner[^"]*")/i',
                '$1 role="main" id="content"',
                $html,
                1
            );
        }
        return $html;
    });
}, 0);
