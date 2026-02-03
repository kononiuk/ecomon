/**
 * ecomon init
 * Creates the one-and-only admin account.  Runs once; after that the server
 * returns 403 and this command tells you so.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const { text, password: promptPassword } = require('../prompt');
const api        = require('../api');

function validatePassword(v) {
  return v.length >= 12 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[@$!%*?&]/.test(v);
}

const cmd = new Command('init')
  .description('Create the admin account (first-time setup)')
  .action(async () => {
    console.log(chalk.cyan('\n  EcoMon – first-time setup\n'));

    // Email with inline validation loop
    let email;
    while (true) {
      email = await text('  Admin email: ');
      if (email.includes('@')) break;
      console.log(chalk.red('    Enter a valid email'));
    }

    // Password with validation loop
    let pw;
    while (true) {
      pw = await promptPassword('  Admin password (≥12 chars, upper, lower, digit, special): ');
      if (validatePassword(pw)) break;
      console.log(chalk.red('    Must be ≥12 chars with uppercase, lowercase, digit, and special char (@$!%*?&)'));
    }

    // Confirm password loop
    let confirm;
    while (true) {
      confirm = await promptPassword('  Confirm password: ');
      if (confirm === pw) break;
      console.log(chalk.red('    Passwords do not match'));
    }

    const res = await api.register(email, pw);

    if (res.status === 201) {
      console.log(chalk.green('\n  ✅  Admin account created'));
      console.log(chalk.dim(`      email: ${res.body.user.email}`));
      console.log(chalk.dim(`      role:  ${res.body.user.role}\n`));
      console.log(chalk.yellow('  Next: run  ecomon login\n'));
    } else if (res.status === 403) {
      console.log(chalk.yellow('\n  ⚠️   Admin already exists. Run: ecomon login\n'));
    } else {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Registration failed'}\n`));
      process.exit(1);
    }
  });

module.exports = cmd;
