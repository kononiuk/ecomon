/**
 * ecomon ecoflow command <deviceSn> <paramsJSON>
 *
 * Send a command to a device.  The params are passed as a JSON string.
 *
 * Example:
 *   ecomon ecoflow command HW52XXXXX '{"cmdCode":"WN511_SET_BAT_LOWER_PACK","params":{"lowerSoc":20}}'
 */
const { Command } = require('commander');
const chalk      = require('chalk');
const api        = require('../api');

const cmd = new Command('command')
  .description('Send a command to a device')
  .argument('<deviceSn>',    'Device serial number')
  .argument('<paramsJSON>',  'Command params as JSON string')
  .action(async (deviceSn, paramsJSON) => {
    let params;
    try {
      params = JSON.parse(paramsJSON);
    } catch {
      console.log(chalk.red('\n  ❌  Invalid JSON. Example:\n'));
      console.log(chalk.dim('      \'{"cmdCode":"WN511_SET_BAT_LOWER_PACK","params":{"lowerSoc":20}}\'\n'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n  Sending command to ${deviceSn}…`));

    const res = await api.sendCommand(deviceSn, params);

    if (res.status === 403) {
      console.log(chalk.red('  ❌  Device not found or access denied\n'));
      process.exit(1);
    }
    if (res.status !== 200) {
      console.log(chalk.red(`  ❌  ${res.body?.message || 'Command failed'}\n`));
      process.exit(1);
    }

    console.log(chalk.green('  ✅  Command sent'));
    if (res.body) console.log(chalk.dim('      Response: ' + JSON.stringify(res.body)));
    console.log('');
  });

module.exports = cmd;
