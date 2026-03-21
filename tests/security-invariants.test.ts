import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('web authn helper posts only to the extension origin', async () => {
  const helperPath = path.join(root, 'public/webauthn-helper.js');
  const source = await readFile(helperPath, 'utf8');

  assert.match(source, /window\.location\.origin/);
  assert.doesNotMatch(source, /postMessage\([^)]*['"]\*['"]/);
});

test('manifest keeps host access narrow and web resources empty', async () => {
  const manifestPath = path.join(root, 'src/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    'chromium:host_permissions'?: string[];
    web_accessible_resources?: unknown[];
  };

  assert.deepEqual(manifest['chromium:host_permissions'], [
    'https://base-sepolia-testnet.skalenodes.com/*',
  ]);
  assert.deepEqual(manifest.web_accessible_resources, []);
});
