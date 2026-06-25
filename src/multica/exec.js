import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runMulticaCommand(multicaCmd, args) {
  const { stdout } = await execFileAsync(multicaCmd, args, {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });

  return stdout.trim() ? JSON.parse(stdout) : {};
}
