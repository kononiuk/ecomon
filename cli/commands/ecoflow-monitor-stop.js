/**
 * ecomon ecoflow monitor stop
 * Stops background data collection.
 */
const { Command } = require('commander');
const chalk       = require('chalk');
const api         = require('../api');

const cmd = new Command('stop')
  .description('Stop device monitoring')
  .action(async () => {
    console.log(chalk.cyan('\n  Stopping monitor…'));

    const res = await api.monitorStop();

    if (res.status !== 200) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed to stop monitor'}\n`));
      process.exit(1);
    }

    console.log(chalk.green('  ✅  ' + (res.body?.message || 'Monitor stopped')));
    if (res.body?.stoppedAt) {
      console.log(chalk.dim(`      stopped at  ${res.body.stoppedAt}\n`));
    }
  });

module.exports = cmd;
