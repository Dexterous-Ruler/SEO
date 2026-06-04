import chalk from 'chalk';

const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg) => console.log(`${chalk.gray(ts())} ${chalk.cyan('•')} ${msg}`),
  ok: (msg) => console.log(`${chalk.gray(ts())} ${chalk.green('✓')} ${msg}`),
  warn: (msg) => console.log(`${chalk.gray(ts())} ${chalk.yellow('!')} ${msg}`),
  err: (msg) => console.log(`${chalk.gray(ts())} ${chalk.red('✗')} ${msg}`),
  step: (msg) => console.log(`\n${chalk.bold.magenta('▸')} ${chalk.bold(msg)}`),
  dim: (msg) => console.log(chalk.gray(msg)),
};

// Colorize a Lighthouse-style 0-100 score
export function scoreColor(score) {
  if (score >= 90) return chalk.green(score);
  if (score >= 50) return chalk.yellow(score);
  return chalk.red(score);
}

export default log;
