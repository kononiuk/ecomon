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
 * Process raw history data into fixed 24-hour timeline with regular intervals
 *
 * @param {Array} rawHistory - Raw data points from database
 * @param {number} intervalMinutes - Time interval in minutes (10, 20, or 30)
 * @returns {Object} { timeLabels: string[], inputSeries: number[], outputSeries: number[] }
 */
function processDataForFixedTimeline(rawHistory, intervalMinutes = 10) {
  const now = new Date();
  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const intervalMs = intervalMinutes * 60 * 1000;
  const numSlots = Math.floor((24 * 60) / intervalMinutes);

  // Generate empty time slots
  const timeSlots = [];
  for (let i = 0; i < numSlots; i++) {
    const slotTime = new Date(startTime.getTime() + i * intervalMs);
    timeSlots.push({
      timestamp: slotTime,
      label: formatTime(slotTime.toISOString()),
      inputWatts: 0,
      outputWatts: 0,
      count: 0
    });
  }

  // Map raw data to time slots
  rawHistory.forEach(point => {
    const pointTime = new Date(point.recordedAt).getTime();
    const elapsedMs = pointTime - startTime.getTime();

    // Find the slot index (round to nearest)
    const slotIndex = Math.round(elapsedMs / intervalMs);

    if (slotIndex >= 0 && slotIndex < numSlots) {
      const slot = timeSlots[slotIndex];
      const count = slot.count;

      // Running average if multiple points map to same slot
      slot.inputWatts = (slot.inputWatts * count + (point.inputWatts || 0)) / (count + 1);
      slot.outputWatts = (slot.outputWatts * count + (point.outputWatts || 0)) / (count + 1);
      slot.count++;
    }
  });

  // Extract arrays for chart
  return {
    timeLabels: timeSlots.map(slot => slot.label),
    inputSeries: timeSlots.map(slot => Math.round(slot.inputWatts)),
    outputSeries: timeSlots.map(slot => Math.round(slot.outputWatts))
  };
}

/**
 * Format a status entry for the event log
 *
 * @param {Object} status - Status object with battery, input, output, grid
 * @returns {string} Formatted log line with colors
 */
function formatLogEntry(status) {
  const battery = status.charge?.percent || status.batteryPercent || 0;
  const input = status.inputWatts || 0;
  const output = status.outputWatts || 0;
  const grid = status.gridConnected;

  return (
    `{cyan-fg}Battery:{/cyan-fg} ${battery}% | ` +
    `{green-fg}Input:{/green-fg} ${input}W | ` +
    `{cyan-fg}Output:{/cyan-fg} ${output}W | ` +
    `{cyan-fg}Grid:{/cyan-fg} ${grid ? '{green-fg}Yes{/green-fg}' : '{red-fg}No{/red-fg}'}`
  );
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
        rows: 12,  // Power (10) + Device/Status (2)
        cols: 12,
        screen: screen
      });

      // ── Step 4: Create widgets ───────────────────────────────────────────────

      // Power line graph (top - 10 rows)
      const powerLine = grid.set(0, 0, 10, 12, contrib.line, {
        label: ` Power (Watts)  │ {green-fg}Input{/green-fg}  {cyan-fg}Output{/cyan-fg} `,
        showLegend: false,
        tags: true,
        xLabelPadding: 3,
        xPadding: 5,
        wholeNumbersOnly: false,
        style: {
          line: 'yellow',
          text: 'white',
          baseline: 'white'
        }
      });

      // Device info box (bottom-left - 2 rows, 6 columns)
      const infoBox = grid.set(10, 0, 2, 6, blessed.box, {
        label: ` Device Information `,
        content: '',
        tags: true,
        style: {
          fg: 'white',
          border: { fg: 'cyan' }
        }
      });

      // Rolling log (bottom-right - 2 rows, 6 columns)
      const logWidget = grid.set(10, 6, 2, 6, contrib.log, {
        label: ' Status History ',
        fg: 'white',
        selectedFg: 'green',
        bufferLength: 50,
        tags: true,
        style: {
          fg: 'white',
          border: { fg: 'yellow' }
        }
      });

      // ── Step 5: Initialize chart data ────────────────────────────────────────

      // Sort history by timestamp (ascending - oldest first)
      history.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

      // Process data into fixed 24-hour timeline with 10-minute intervals
      const processed = processDataForFixedTimeline(history, 10);
      const timeLabels = processed.timeLabels;
      const inputSeries = processed.inputSeries;
      const outputSeries = processed.outputSeries;

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

      // Populate event log with last 5 history entries
      if (history.length > 0) {
        const recentHistory = history.slice(-5);  // Last 5 entries
        recentHistory.forEach(entry => {
          logWidget.log(formatLogEntry(entry));
        });
      }

      // ── Step 6: Polling loop ──────────────────────────────────────────────────
      const intervalMs = parseInt(opts.interval);

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

      screen.render();

      // Set up polling interval
      const pollInterval = setInterval(async () => {
        try {
          // Fetch current status
          const res = await api.getStatus(deviceSn);

          if (res.status !== 200) {
            screen.render();
            return;
          }

          const status = res.body;
          const now = new Date();

          // Add new data point to history array
          history.push({
            deviceSn: deviceSn,
            batteryPercent: status.charge.percent,
            inputWatts: status.inputWatts || 0,
            outputWatts: status.outputWatts || 0,
            gridConnected: status.gridConnected,
            recordedAt: now.toISOString()
          });

          // Keep history to 24h (filter old points)
          const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
          history = history.filter(h => new Date(h.recordedAt).getTime() > cutoffTime);

          // Re-process entire history into fixed timeline
          const processed = processDataForFixedTimeline(history, 10);

          // Update power graph with processed data
          powerLine.setData([
            {
              title: 'Input',
              x: processed.timeLabels,
              y: processed.inputSeries,
              style: { line: 'green' }
            },
            {
              title: 'Output',
              x: processed.timeLabels,
              y: processed.outputSeries,
              style: { line: 'cyan' }
            }
          ]);

          // Update device info box
          infoBox.setContent(
            `{cyan-fg}Name:{/cyan-fg} ${status.name}\n` +
            `{cyan-fg}Serial:{/cyan-fg} ${deviceSn}\n` +
            `{cyan-fg}Battery:{/cyan-fg} ${status.charge.percent}%\n` +
            `{cyan-fg}Input:{/cyan-fg} ${status.inputWatts} W\n` +
            `{cyan-fg}Output:{/cyan-fg} ${status.outputWatts} W\n` +
            `{cyan-fg}Grid:{/cyan-fg} ${status.gridConnected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'}`
          );

          // Add new entry to event log
          logWidget.log(formatLogEntry(status));

          screen.render();
        } catch (err) {
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
