import { execFile, spawn } from 'node:child_process';

function execFileText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function spawnText(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr || `Command failed with exit code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    child.stdin.end(input || '');
  });
}

export async function hasPandoc() {
  try {
    await execFileText('pandoc', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function renderMarkdownToTex(markdown) {
  try {
    const { stdout } = await spawnText('pandoc', [
      '--from', 'markdown',
      '--to', 'latex',
    ], markdown || '');
    return stdout;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missing = new Error('Pandoc is required to render raw TeX.');
      missing.code = 'PANDOC_MISSING';
      throw missing;
    }

    const failed = new Error(error.stderr || error.message || 'Pandoc failed to render raw TeX.');
    failed.code = 'PANDOC_FAILED';
    failed.stderr = error.stderr;
    failed.stdout = error.stdout;
    throw failed;
  }
}
