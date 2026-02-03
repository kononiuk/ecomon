/**
 * ecomon ecoflow init
 * Prompts for AccessKey + SecretKey, stores them encrypted via the API.
 * The keys are never written to disk by the CLI — only sent over localhost.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const { text, password: promptPassword } = require('../prompt');
const api        = require('../api');

const cmd = new Command('init')
  .description('Store your EcoFlow API credentials (encrypted at rest)')
  .action(async () => {
    console.log(chalk.cyan('\n  EcoFlow credential setup'));
    console.log(chalk.dim('  Keys are encrypted with AES-256-GCM before storage.\n'));

    const accessKey = await promptPassword('  EcoFlow Access Key: ');
    const secretKey = await promptPassword('  EcoFlow Secret Key: ');
    let   label     = await text('  Label (e.g. "Home DELTA 2") [My EcoFlow]: ');
    if (!label) label = 'My EcoFlow';

    const res = await api.storeCredentials(accessKey, secretKey, label);

    if (res.status === 200 || res.status === 201) {
      console.log(chalk.green('\n  ✅  Credentials stored'));
      console.log(chalk.dim(`      id:    ${res.body.id}`));
      console.log(chalk.dim(`      label: ${label}\n`));
      console.log(chalk.yellow('  Next: run  ecomon ecoflow devices\n'));
    } else {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed to store credentials'}\n`));
      process.exit(1);
    }
  });

module.exports = cmd;
