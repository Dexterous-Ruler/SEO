// WCAG contrast utilities — deterministic, no network needed.
// Computes contrast ratios and finds the nearest accessible color that
// preserves hue (so brand identity stays intact while passing AA 4.5:1).

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Relative luminance per WCAG 2.x.
function luminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(hex1, hex2) {
  const L1 = luminance(hexToRgb(hex1));
  const L2 = luminance(hexToRgb(hex2));
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// RGB <-> HSL so we can darken/lighten while keeping hue + saturation.
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

// Find the nearest shade of `fg` (same hue/sat) that hits `target` ratio
// against `bg`. Tries darkening first (text on light bg), then lightening.
export function nearestAccessible(fg, bg, target = 4.5) {
  if (contrastRatio(fg, bg) >= target) return { hex: fg, changed: false, ratio: contrastRatio(fg, bg) };
  const hsl = rgbToHsl(hexToRgb(fg));
  const bgL = luminance(hexToRgb(bg));

  // Decide direction: if bg is light, darken text; else lighten.
  const darken = bgL > 0.5;
  for (let step = 1; step <= 100; step++) {
    const l = darken ? hsl.l - step / 100 : hsl.l + step / 100;
    if (l < 0 || l > 1) break;
    const cand = rgbToHex(hslToRgb({ ...hsl, l }));
    if (contrastRatio(cand, bg) >= target) {
      return { hex: cand, changed: true, ratio: Number(contrastRatio(cand, bg).toFixed(2)) };
    }
  }
  // Fallback: pure black or white.
  const bw = darken ? '#000000' : '#ffffff';
  return { hex: bw, changed: true, ratio: Number(contrastRatio(bw, bg).toFixed(2)), fallback: true };
}

export default { contrastRatio, nearestAccessible };
