/**
 * ecomon ecoflow status <deviceSn>
 * Pulls live status from the device and prints the key metrics.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const api        = require('../api');

const cmd = new Command('status')
  .description('Show live status of a device')
  .argument('<deviceSn>', 'Device serial number (from: ecomon ecoflow devices)')
  .action(async (deviceSn) => {
    const res = await api.getStatus(deviceSn);

    if (res.status === 403) {
      console.log(chalk.red('\n  ❌  Device not found or access denied\n'));
      process.exit(1);
    }
    if (res.status !== 200) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed'}\n`));
      process.exit(1);
    }

    // The EcoFlow API nests properties under .data or returns them flat — handle both
    const props = res.body?.result?.result ?? res.body?.data ?? res.body;

    console.log(chalk.cyan(`\n  Live status — ${deviceSn}\n`));
    console.log(chalk.dim('  ' + '─'.repeat(44)));

    // Pretty-print known fields with labels, then dump the rest
    const known = {
      bmsSoC:       { label: 'Battery',       unit: '%',  fmt: (v) => (v >= 50 ? chalk.green(v) : v >= 20 ? chalk.yellow(v) : chalk.red(v)) },
      inPower:      { label: 'Input power',   unit: 'W'  },
      outPower:     { label: 'Output power',  unit: 'W'  },
      chargeState:  { label: 'Charge state',  unit: '',   fmt: (v) => ({ 0: chalk.green('Charging'), 1: chalk.yellow('Discharging'), 2: chalk.dim('Idle') })[v] ?? String(v) },
      temp:         { label: 'Temperature',   unit: '°C' },
      remainMinute: { label: 'Time remain',   unit: 'min' },
    };

    const printed = new Set();
    for (const [key, meta] of Object.entries(known)) {
      if (props[key] !== undefined) {
        const val = meta.fmt ? meta.fmt(props[key]) : props[key];
        console.log(`  ${chalk.dim((meta.label + ':').padEnd(18))} ${val} ${chalk.dim(meta.unit)}`);
        printed.add(key);
      }
    }

    // Dump remaining fields in dim
    const rest = Object.entries(props).filter(([k]) => !printed.has(k));
    if (rest.length > 0) {
      console.log(chalk.dim('\n  ── raw properties ──'));
      for (const [k, v] of rest) {
        console.log(chalk.dim(`  ${k}: ${JSON.stringify(v)}`));
      }
    }

    console.log(chalk.dim('\n  ' + '─'.repeat(44) + '\n'));
  });

module.exports = cmd;
