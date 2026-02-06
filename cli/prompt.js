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

/** Password prompt — input is masked with asterisks */
function password(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    // Set raw mode BEFORE creating readline to prevent echo
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
        resolve(input);
      } else if (ch === '\u0003') { // Ctrl-C
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') { // backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          // Erase asterisk from display: backspace, space, backspace
          process.stdout.write('\b \b');
        }
      } else {
        input += ch;
        // Display asterisk for the typed character
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}

module.exports = { text, password };
