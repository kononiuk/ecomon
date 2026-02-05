const { Command } = require('commander');
const chalk = require('chalk');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const api = require('../api');

/**
 * Format ISO timestamp to HH:MM format for X-axis labels
 */
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Generate horizontal timeline bar showing grid connection status
 * Returns formatted string with colored blocks for connected/disconnected periods
 */
function generateGridTimeline(history) {
  if (history.length === 0) {
    return '{red-fg}' + '━'.repeat(96) + '{/red-fg} (no data yet)';
  }

  // Sort by time
  const sorted = [...history].sort((a, b) =>
    new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Group consecutive same-state periods
  const segments = [];
  let currentState = sorted[0].gridConnected;
  let startTime = new Date(sorted[0].recordedAt);

  sorted.forEach((point, idx) => {
    if (point.gridConnected !== currentState || idx === sorted.length - 1) {
      segments.push({
        connected: currentState,
        start: startTime,
        end: new Date(point.recordedAt)
      });
      currentState = point.gridConnected;
      startTime = new Date(point.recordedAt);
    }
  });

  // Calculate total time span
  const firstTime = new Date(sorted[0].recordedAt).getTime();
  const lastTime = new Date(sorted[sorted.length - 1].recordedAt).getTime();
  const totalDuration = lastTime - firstTime || 1;

  // Generate visual bar (96 chars wide for good resolution)
  const barWidth = 96;
  let timeline = '';

  segments.forEach(seg => {
    const segStart = new Date(seg.start).getTime();
    const segEnd = new Date(seg.end).getTime();
    const segDuration = segEnd - segStart;
    const segWidth = Math.max(1, Math.round((segDuration / totalDuration) * barWidth));

    const color = seg.connected ? 'green-fg' : 'red-fg';
    timeline += `{${color}}` + '━'.repeat(segWidth) + `{/${color}}`;
  });

  // Add time labels
  const startLabel = formatTime(sorted[0].recordedAt);
  const endLabel = formatTime(sorted[sorted.length - 1].recordedAt);
  const duration = Math.round((totalDuration / 1000 / 60)); // minutes

  return timeline + `\n{cyan-fg}${startLabel}{/cyan-fg}` +
         ' '.repeat(barWidth - startLabel.length - endLabel.length - 2) +
         `{cyan-fg}${endLabel}{/cyan-fg}  ({yellow-fg}${duration} min{/yellow-fg})`;
}

/**
 * Main dashboard command
 */
const cmd = new Command('dashboard')
  .description('Real-time device monitoring dashboard with graphs')
  .argument('<deviceSn>', 'Device serial number')
  .option('--interval <ms>', 'Refresh interval in milliseconds', '30000')
  .action(async (deviceSn, opts) => {
    try {
      // ── Step 1: Validate device access ───────────────────────────────────────
      const statusRes = await api.getStatus(deviceSn);

      if (statusRes.status === 404) {
        console.log(chalk.red(`❌ Device ${deviceSn} not found`));
        process.exit(1);
      }

      if (statusRes.status === 403) {
        console.log(chalk.red(`❌ Access denied to device ${deviceSn}`));
        process.exit(1);
      }

      if (statusRes.status !== 200) {
        console.log(chalk.red(`❌ Failed to fetch device status: ${statusRes.body?.message || 'Unknown error'}`));
        process.exit(1);
      }

      const deviceName = statusRes.body.name;

      // ── Step 2: Fetch historical data (last 24h) ─────────────────────────────
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const to = new Date();
      const historyRes = await api.getHistory(deviceSn, from.toISOString(), to.toISOString(), 1440);

      let history = [];
      if (historyRes.status === 200 && Array.isArray(historyRes.body)) {
        history = historyRes.body;
      }

      // ── Step 3: Initialize blessed screen and grid ───────────────────────────
      const screen = blessed.screen({
        smartCSR: true,
        title: `EcoMon Dashboard - ${deviceName}`
      });

      const grid = new contrib.grid({
        rows: 12,
        cols: 12,
        screen: screen
      });

      // ── Step 4: Create widgets ───────────────────────────────────────────────

      // Power line graph (top - 7 rows)
      const powerLine = grid.set(0, 0, 7, 12, contrib.line, {
        label: ` Power (Watts) - Last 24 Hours  │ Green=Input  Cyan=Output `,
        showLegend: false,
        xLabelPadding: 3,
        xPadding: 5,
        wholeNumbersOnly: false,
        style: {
          line: 'yellow',
          text: 'white',
          baseline: 'white'
        }
      });

      // Grid connection timeline (middle - 2 rows)
      const gridTimeline = grid.set(7, 0, 2, 12, blessed.box, {
        label: ` Grid Connection Timeline `,
        content: '',
        tags: true,
        style: {
          fg: 'white',
          border: { fg: 'yellow' }
        }
      });

      // Device info box (bottom-middle - 2 rows)
      const infoBox = grid.set(9, 0, 2, 12, blessed.box, {
        label: ` Device Information `,
        content: '',
        tags: true,
        style: {
          fg: 'white',
          border: { fg: 'cyan' }
        }
      });

      // Footer status box (bottom - 1 row)
      const footer = grid.set(11, 0, 1, 12, blessed.box, {
        label: ` Status `,
        content: 'Initializing...',
        tags: true,
        style: {
          fg: 'white',
          border: { fg: 'yellow' }
        }
      });

      // ── Step 5: Initialize chart data ────────────────────────────────────────

      // Sort history by timestamp (ascending - oldest first)
      history.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

      // Power graph data arrays
      const timeLabels = history.map(h => formatTime(h.recordedAt));
      const inputSeries = history.map(h => h.inputWatts || 0);
      const outputSeries = history.map(h => h.outputWatts || 0);

      // Set initial power chart data
      powerLine.setData([
        {
          title: 'Input',
          x: timeLabels.length > 0 ? timeLabels : ['--'],
          y: inputSeries.length > 0 ? inputSeries : [0],
          style: { line: 'green' }
        },
        {
          title: 'Output',
          x: timeLabels.length > 0 ? timeLabels : ['--'],
          y: outputSeries.length > 0 ? outputSeries : [0],
          style: { line: 'cyan' }
        }
      ]);

      // Set initial grid connection timeline
      gridTimeline.setContent('\n' + generateGridTimeline(history));

      // ── Step 6: Helper function to update footer ─────────────────────────────
      function updateFooter(message, color = 'white') {
        footer.setContent(`{${color}-fg}${message}{/${color}-fg}`);
      }

      // ── Step 7: Polling loop ──────────────────────────────────────────────────
      const intervalMs = parseInt(opts.interval);

      updateFooter('Loading initial data...', 'yellow');
      screen.render();

      // Initial render with current status
      const initialStatus = statusRes.body;
      infoBox.setContent(
        `{cyan-fg}Name:{/cyan-fg} ${initialStatus.name}\n` +
        `{cyan-fg}Serial:{/cyan-fg} ${deviceSn}\n` +
        `{cyan-fg}Battery:{/cyan-fg} ${initialStatus.charge.percent}%\n` +
        `{cyan-fg}Input:{/cyan-fg} ${initialStatus.inputWatts} W\n` +
        `{cyan-fg}Output:{/cyan-fg} ${initialStatus.outputWatts} W\n` +
        `{cyan-fg}Grid:{/cyan-fg} ${initialStatus.gridConnected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'}`
      );

      updateFooter(`Last updated: ${new Date().toLocaleString()} | Refresh: ${intervalMs/1000}s`, 'green');
      screen.render();

      // Set up polling interval
      const pollInterval = setInterval(async () => {
        try {
          // Fetch current status
          const res = await api.getStatus(deviceSn);

          if (res.status !== 200) {
            updateFooter(`Error: ${res.body?.message || 'Failed to fetch status'}`, 'red');
            screen.render();
            return;
          }

          const status = res.body;
          const now = new Date();

          // Append new data point to chart (sliding window)
          timeLabels.push(formatTime(now.toISOString()));
          inputSeries.push(status.inputWatts || 0);
          outputSeries.push(status.outputWatts || 0);

          // Keep only last 1440 points (24h at 1 per minute)
          if (timeLabels.length > 1440) {
            timeLabels.shift();
            inputSeries.shift();
            outputSeries.shift();
          }

          // Add new data point to history for grid chart
          history.push({
            deviceSn: deviceSn,
            batteryPercent: status.charge.percent,
            inputWatts: status.inputWatts || 0,
            outputWatts: status.outputWatts || 0,
            gridConnected: status.gridConnected,
            recordedAt: now.toISOString()
          });

          // Keep history to 24h
          const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
          history = history.filter(h => new Date(h.recordedAt).getTime() > cutoffTime);

          // Update power graph
          powerLine.setData([
            {
              title: 'Input',
              x: timeLabels,
              y: inputSeries,
              style: { line: 'green' }
            },
            {
              title: 'Output',
              x: timeLabels,
              y: outputSeries,
              style: { line: 'cyan' }
            }
          ]);

          // Refresh grid connection timeline
          gridTimeline.setContent('\n' + generateGridTimeline(history));

          // Update device info box
          infoBox.setContent(
            `{cyan-fg}Name:{/cyan-fg} ${status.name}\n` +
            `{cyan-fg}Serial:{/cyan-fg} ${deviceSn}\n` +
            `{cyan-fg}Battery:{/cyan-fg} ${status.charge.percent}%\n` +
            `{cyan-fg}Input:{/cyan-fg} ${status.inputWatts} W\n` +
            `{cyan-fg}Output:{/cyan-fg} ${status.outputWatts} W\n` +
            `{cyan-fg}Grid:{/cyan-fg} ${status.gridConnected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'}`
          );

          // Update footer with timestamp
          updateFooter(`Last updated: ${now.toLocaleString()} | Refresh: ${intervalMs/1000}s`, 'green');

          screen.render();
        } catch (err) {
          updateFooter(`Error: ${err.message}`, 'red');
          screen.render();
        }
      }, intervalMs);

      // ── Step 8: Graceful shutdown ─────────────────────────────────────────────

      // Handle keyboard shortcuts
      screen.key(['escape', 'q', 'C-c'], () => {
        clearInterval(pollInterval);
        screen.destroy();
        process.exit(0);
      });

      // Handle SIGINT (Ctrl+C)
      process.on('SIGINT', () => {
        clearInterval(pollInterval);
        screen.destroy();
        process.exit(0);
      });

      // Render the screen
      screen.render();

    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

module.exports = cmd;
