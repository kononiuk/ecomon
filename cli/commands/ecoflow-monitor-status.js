/**
 * ecomon ecoflow monitor status
 * Shows whether the monitor is currently running and when it started / stopped.
 */
const { Command } = require('commander');
const chalk       = require('chalk');
const api         = require('../api');

const cmd = new Command('status')
  .description('Show current monitor state')
  .action(async () => {
    const res = await api.monitorStatus();

    if (res.status !== 200) {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed to fetch monitor status'}\n`));
      process.exit(1);
    }

    const state = res.body;

    console.log(chalk.cyan('\n  Monitor status\n'));
    console.log(chalk.dim('  ' + '─'.repeat(44)));

    if (!state || !state.isRunning) {
      console.log(`  ${chalk.dim('State:'.padEnd(18))} ${chalk.red('Stopped')}`);
      if (state?.stoppedAt) {
        console.log(`  ${chalk.dim('Stopped at:'.padEnd(18))} ${chalk.dim(state.stoppedAt)}`);
      } else {
        console.log(`  ${chalk.dim(''.padEnd(18))} ${chalk.dim('(never started)')}`);
      }
    } else {
      console.log(`  ${chalk.dim('State:'.padEnd(18))} ${chalk.green('Running')}`);
      if (state.startedAt) {
        console.log(`  ${chalk.dim('Started at:'.padEnd(18))} ${chalk.dim(state.startedAt)}`);
      }
    }

    console.log(chalk.dim('\n  ' + '─'.repeat(44) + '\n'));
  });

module.exports = cmd;
