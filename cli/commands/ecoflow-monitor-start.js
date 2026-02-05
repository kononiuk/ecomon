/**
 * ecomon ecoflow monitor start
 * Starts hybrid data collection (REST polling + MQTT push).
 *
 * --devices SN1,SN2   monitor only the listed serial numbers
 * (no flag)           monitor every device on the account
 */
const { Command } = require('commander');
const chalk       = require('chalk');
const api         = require('../api');

const cmd = new Command('start')
  .description('Start device monitoring (REST polling + MQTT push)')
  .option('--devices <sns>', 'Comma-separated device serial numbers to monitor (default: all)')
  .action(async (opts) => {
    // Parse the comma-separated list; trim whitespace around each SN.
    const devices = opts.devices
      ? opts.devices.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    console.log(chalk.cyan('\n  Starting monitor…'));
    if (devices) {
      console.log(chalk.dim(`      devices:    ${devices.join(', ')}`));
    }

    const res = await api.monitorStart(devices);

    if (res.status !== 200 && res.status !== 201) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed to start monitor'}\n`));
      process.exit(1);
    }

    console.log(chalk.green('  ✅  ' + (res.body?.message || 'Monitor started')));
    if (res.body?.devices) {
      console.log(chalk.dim(`      devices:    ${res.body.devices.join(', ')}`));
    } else if (!res.body?.devices) {
      console.log(chalk.dim('      devices:    all'));
    }
    if (res.body?.startedAt) {
      console.log(chalk.dim(`      started at  ${res.body.startedAt}\n`));
    }
  });

module.exports = cmd;
