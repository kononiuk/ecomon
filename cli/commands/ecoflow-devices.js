/**
 * ecomon ecoflow devices
 * Lists all devices on your EcoFlow account.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const api        = require('../api');

const cmd = new Command('devices')
  .description('List your EcoFlow devices')
  .action(async () => {
    const res = await api.getDevices();

    if (res.status !== 200) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed to fetch devices'}\n`));
      process.exit(1);
    }

    const devices = res.body?.data ?? res.body;

    if (!Array.isArray(devices) || devices.length === 0) {
      console.log(chalk.yellow('\n  No devices found.\n'));
      return;
    }

    console.log(chalk.cyan('\n  Your EcoFlow devices\n'));
    console.log(chalk.dim('  ' + '─'.repeat(60)));

    devices.forEach((d, i) => {
      const online = d.online === 1;
      const dot    = online ? chalk.green('●') : chalk.red('●');
      console.log(`  ${dot}  ${chalk.bold(d.deviceName || 'Unnamed')}  ${chalk.dim(`(${d.deviceModel || 'unknown model'})`)}`);
      console.log(chalk.dim(`      SN: ${d.sn}`));
      if (i < devices.length - 1) console.log(chalk.dim('      ─────'));
    });

    console.log(chalk.dim('  ' + '─'.repeat(60)));
    console.log(chalk.dim(`\n  ${devices.length} device(s).  Use:  ecomon ecoflow status <SN>\n`));
  });

module.exports = cmd;
