// Zero-dependency console logger (no chalk) — keeps the server's runtime import
// graph dependency-free so the production image needs only `dotenv`.
const C = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const c = {
  gray: C('90'), cyan: C('36'), green: C('32'), yellow: C('33'),
  red: C('31'), magenta: C('35'), bold: C('1'),
  boldMagenta: (s) => `\x1b[1m\x1b[35m${s}\x1b[0m`,
};

const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg) => console.log(`${c.gray(ts())} ${c.cyan('•')} ${msg}`),
  ok: (msg) => console.log(`${c.gray(ts())} ${c.green('✓')} ${msg}`),
  warn: (msg) => console.log(`${c.gray(ts())} ${c.yellow('!')} ${msg}`),
  err: (msg) => console.log(`${c.gray(ts())} ${c.red('✗')} ${msg}`),
  step: (msg) => console.log(`\n${c.boldMagenta('▸')} ${c.bold(msg)}`),
  dim: (msg) => console.log(c.gray(msg)),
};

// Colorize a Lighthouse-style 0-100 score
export function scoreColor(score) {
  if (score >= 90) return c.green(score);
  if (score >= 50) return c.yellow(score);
  return c.red(score);
}

export default log;
