#!/usr/bin/env node
/**
 * ecomon – admin CLI for EcoMon
 *
 * Command layout
 *   ecomon init                             – create admin (first-time)
 *   ecomon login                            – log in
 *   ecomon logout                           – log out
 *   ecomon auth change-password             – change admin password
 *   ecomon ecoflow init                     – store EcoFlow API keys
 *   ecomon ecoflow devices                  – list devices
 *   ecomon ecoflow status <sn>              – live device status
 *   ecomon ecoflow command <sn> <json>      – send command
 *   ecomon ecoflow monitor start            – start data collection
 *   ecomon ecoflow monitor stop             – stop data collection
 *   ecomon ecoflow monitor status           – show monitor state
 *
 * Architecture
 *   • Top-level ("flat") commands live in cli/commands/<name>.js
 *   • Sub-command groups (ecoflow, auth) each have their own parent
 *     Command created here; the children are loaded from
 *     cli/commands/ecoflow-*.js  and  cli/commands/auth-*.js
 *   • Every command file exports a single Commander Command whose
 *     .name() is the LAST segment only (e.g. "init", "devices", "change-password").
 */
const { Command }  = require('commander');
const { readdirSync } = require('fs');
const { join }     = require('path');
const chalk        = require('chalk');

const program = new Command();

program
  .name('ecomon')
  .description(chalk.cyan('EcoMon') + ' – secure EcoFlow power station CLI')
  .version('0.1.0');

// ── helpers ──────────────────────────────────────────────────────────────────
const commandsDir = join(__dirname, 'commands');

function loadCommand(filename) {
  return require(join(commandsDir, filename));
}

function loadGlob(prefix) {
  // e.g. prefix = 'ecoflow-'  →  ['ecoflow-init.js', 'ecoflow-devices.js', ...]
  return readdirSync(commandsDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.js'))
    .sort();
}

// ── flat (top-level) commands ────────────────────────────────────────────────
const flatFiles = ['init.js', 'login.js', 'logout.js'];

for (const file of flatFiles) {
  program.addCommand(loadCommand(file));
}

// ── ecoflow sub-command group ────────────────────────────────────────────────
const ecoflow = new Command('ecoflow')
  .description('Manage EcoFlow power station integration');

// Direct ecoflow sub-commands — exclude ecoflow-monitor-* (those nest one level deeper)
for (const file of loadGlob('ecoflow-').filter(f => !f.startsWith('ecoflow-monitor-'))) {
  ecoflow.addCommand(loadCommand(file));
}

// ── ecoflow monitor sub-group ────────────────────────────────────────────────
const monitor = new Command('monitor')
  .description('Start, stop, and inspect device data collection');

for (const file of loadGlob('ecoflow-monitor-')) {
  monitor.addCommand(loadCommand(file));
}

ecoflow.addCommand(monitor);

program.addCommand(ecoflow);

// ── auth sub-command group ───────────────────────────────────────────────────
const auth = new Command('auth')
  .description('Authentication & account management');

for (const file of loadGlob('auth-')) {
  auth.addCommand(loadCommand(file));
}

program.addCommand(auth);

// ── run ──────────────────────────────────────────────────────────────────────
program.parse();

// If no command given, print help
if (process.argv.length < 3) {
  program.outputHelp();
}
