/**
 * ecomon auth change-password
 * Prompts for current + new password, calls PATCH /auth/password.
 * On success every other session is revoked — the CLI re-logs in with the new password.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const { password: promptPassword } = require('../prompt');
const api        = require('../api');

function validatePassword(v) {
  return v.length >= 12 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[@$!%*?&]/.test(v);
}

const cmd = new Command('change-password')
  .description('Change the admin password (revokes all other sessions)')
  .action(async () => {
    const currentPassword = await promptPassword('  Current password: ');

    // New password with validation loop
    let newPassword;
    while (true) {
      newPassword = await promptPassword('  New password (≥12 chars, upper, lower, digit, special): ');
      if (validatePassword(newPassword)) break;
      console.log(chalk.red('    Must be ≥12 chars with uppercase, lowercase, digit, and special char (@$!%*?&)'));
    }

    // Confirm new password loop
    while (true) {
      const confirm = await promptPassword('  Confirm new password: ');
      if (confirm === newPassword) break;
      console.log(chalk.red('    Passwords do not match'));
    }

    const res = await api.changePassword(currentPassword, newPassword);

    if (res.status === 200) {
      console.log(chalk.green('\n  ✅  Password changed'));
      console.log(chalk.dim('      All other sessions have been revoked.\n'));

      // Re-login with new password so this CLI session stays alive
      const s = api._session.load();
      if (s) {
        const login = await api.login(s.email, newPassword);
        if (login.status === 200) {
          api._session.save({ email: s.email, accessToken: login.body.accessToken, refreshToken: login.body.refreshToken });
          console.log(chalk.dim('      This session re-authenticated automatically.\n'));
        }
      }
    } else if (res.status === 401) {
      console.log(chalk.red('\n  ❌  Current password is incorrect\n'));
      process.exit(1);
    } else {
      console.log(chalk.red(`\n  ❌  ${res.body?.message || 'Failed'}\n`));
      process.exit(1);
    }
  });

module.exports = cmd;
