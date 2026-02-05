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
 * Transform historical data into grid connection bar chart data
 * Groups data by hour and shows green/red bars based on majority connection state
 */
function transformGridHistory(history) {
  // Group by hour and check if grid was connected during that hour
  const hourlyBuckets = new Map();

  history.forEach(point => {
    const hour = new Date(point.recordedAt).getHours();
    const label = `${hour.toString().padStart(2, '0')}:00`;

    if (!hourlyBuckets.has(label)) {
      hourlyBuckets.set(label, { connected: 0, total: 0 });
    }

    const bucket = hourlyBuckets.get(label);
    bucket.total++;
    if (point.gridConnected) bucket.connected++;
  });

  // Convert to bar chart format
  const titles = [];
  const data = [];
  const colors = [];

  // Ensure we have all 24 hours (fill missing hours with 0)
  for (let h = 0; h < 24; h++) {
    const label = `${h.toString().padStart(2, '0')}:00`;
    const bucket = hourlyBuckets.get(label) || { connected: 0, total: 0 };

    titles.push(label);
    // Use 1 for connected, 0 for disconnected (binary height)
    data.push(bucket.connected > bucket.total / 2 ? 1 : 0);
    colors.push(bucket.connected > bucket.total / 2 ? 'green' : 'red');
  }

  return {
    titles,
    data,
    barColor: colors
  };
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

      // Power line graph (top - 5 rows)
      const powerLine = grid.set(0, 0, 5, 12, contrib.line, {
        label: ` Power (Watts) - Last 24 Hours `,
        showLegend: true,
        legend: { width: 20 },
        xLabelPadding: 3,
        xPadding: 5,
        wholeNumbersOnly: false,
        style: {
          line: 'yellow',
          text: 'white',
          baseline: 'white'
        }
      });

      // Grid connection bar chart (middle-top - 3 rows)
      const gridBar = grid.set(5, 0, 3, 12, contrib.bar, {
        label: ` Grid Connection History - Last 24 Hours `,
        barWidth: 4,
        barSpacing: 2,
        xOffset: 0,
        maxHeight: 1  // Binary: connected (1) or disconnected (0)
      });

      // Device info box (middle-bottom - 3 rows)
      const infoBox = grid.set(8, 0, 3, 12, blessed.box, {
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

      // Set initial grid connection bar chart
      const gridData = transformGridHistory(history);
      gridBar.setData(gridData);

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

          // Refresh grid bar chart with updated data
          const gridData = transformGridHistory(history);
          gridBar.setData(gridData);

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
