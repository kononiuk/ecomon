/**
 * ecomon login
 * Prompts email + password, stores the token pair in ~/.ecomon/session.json
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const { text, password: promptPassword } = require('../prompt');
const api        = require('../api');

const cmd = new Command('login')
  .description('Log in as admin')
  .action(async () => {
    const email    = await text('  Email: ');
    const pw       = await promptPassword('  Password: ');

    const res = await api.login(email, pw);

    if (res.status === 200) {
      api._session.save({
        email,
        accessToken:  res.body.accessToken,
        refreshToken: res.body.refreshToken,
      });
      console.log(chalk.green('\n  ✅  Logged in'));
      console.log(chalk.dim(`      token expires in ${res.body.expiresIn}s (auto-refreshed)\n`));
    } else {
      console.log(chalk.red('\n  ❌  Invalid email or password\n'));
      process.exit(1);
    }
  });

module.exports = cmd;
