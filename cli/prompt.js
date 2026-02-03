/**
 * Tiny prompt helpers built on Node's built-in readline.
 * No external dependencies.
 */
const readline = require('readline');

function createRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/** Plain text prompt */
function text(question) {
  return new Promise((resolve) => {
    const rl = createRL();
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

/** Password prompt — input is hidden */
function password(question) {
  return new Promise((resolve) => {
    const rl = createRL();
    // Mute input on the raw stream so characters don't echo
    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let input = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (ch === '\u0003') { // Ctrl-C
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') { // backspace
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

module.exports = { text, password };
