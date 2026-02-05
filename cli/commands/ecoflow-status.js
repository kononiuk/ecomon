/**
 * ecomon ecoflow status <deviceSn> [--raw]
 *
 * Default : shows the server-parsed summary (name, charge, watts, grid).
 * --raw   : dumps the full unprocessed EcoFlow properties object.
 *
 * Adding a new display field later = one line in the FIELDS array below.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const api        = require('../api');

// ── declarative display fields ───────────────────────────────────────────────
// Each entry maps one value from the parsed DeviceStatusDto to a formatted row.
// `path` uses dot notation resolved against the response body.
const FIELDS = [
  { path: 'name',            label: 'Device',       unit: '',   fmt: (v) => chalk.bold(v) },
  { path: 'charge.percent',  label: 'Battery',      unit: '%',  fmt: (v) => (v >= 50 ? chalk.green(v) : v >= 20 ? chalk.yellow(v) : chalk.red(v)) },
  { path: 'inputWatts',      label: 'Input power',  unit: 'W'  },
  { path: 'outputWatts',     label: 'Output power', unit: 'W'  },
  { path: 'gridConnected',   label: 'Grid',         unit: '',   fmt: (v) => v ? chalk.green('Connected') : chalk.dim('Disconnected') },
];

/** Resolve a dot-separated path against an object (e.g. "charge.percent") */
function get(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// ── command ──────────────────────────────────────────────────────────────────
const cmd = new Command('status')
  .description('Show live status of a device')
  .argument('<deviceSn>', 'Device serial number (from: ecomon ecoflow devices)')
  .option('--raw', 'Return the original unprocessed EcoFlow response')
  .action(async (deviceSn, opts) => {
    const res = await api.getStatus(deviceSn, { raw: opts.raw });

    if (res.status === 403) {
      console.log(chalk.red('\n  ❌  Device not found or access denied\n'));
      process.exit(1);
    }
    if (res.status !== 200) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed'}\n`));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n  Live status — ${deviceSn}\n`));
    console.log(chalk.dim('  ' + '─'.repeat(44)));

    if (opts.raw) {
      // ── raw mode: dump every key/value from the raw sub-object ──────────
      const raw = res.body?.raw ?? res.body;
      for (const [k, v] of Object.entries(raw)) {
        console.log(chalk.dim(`  ${k}: ${JSON.stringify(v)}`));
      }
    } else {
      // ── parsed mode: iterate FIELDS ─────────────────────────────────────
      for (const field of FIELDS) {
        const value = get(res.body, field.path);
        if (value === undefined || value === null) continue;
        const display = field.fmt ? field.fmt(value) : value;
        console.log(`  ${chalk.dim((field.label + ':').padEnd(18))} ${display} ${chalk.dim(field.unit)}`);
      }
    }

    console.log(chalk.dim('\n  ' + '─'.repeat(44) + '\n'));
  });

module.exports = cmd;
