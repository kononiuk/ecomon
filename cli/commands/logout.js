/**
 * ecomon logout
 * Revokes the refresh token server-side, then wipes the local session.
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const api        = require('../api');

const cmd = new Command('logout')
  .description('Log out and revoke session')
  .action(async () => {
    const s = api._session.load();
    if (!s) {
      console.log(chalk.yellow('\n  Not logged in.\n'));
      return;
    }

    const res = await api.logout(s.refreshToken);
    api._session.clear();

    if (res.status === 200) {
      console.log(chalk.green('\n  ✅  Logged out\n'));
    } else {
      // Token may already be invalid — session is cleared regardless
      console.log(chalk.green('\n  ✅  Session cleared\n'));
    }
  });

module.exports = cmd;
