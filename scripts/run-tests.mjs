import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const testFiles = await findSpecFiles('dist-test');
if (testFiles.length === 0) {
  throw new Error('No compiled spec files found in dist-test.');
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

async function findSpecFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return findSpecFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.spec.js') ? [path] : [];
    }),
  );
  return files.flat().sort();
}
