import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/index';

test('CORS is returned only for origins on the allow-list', async () => {
  const { server } = buildServer({ ALLOWED_ORIGINS: 'https://app.example.com' } as NodeJS.ProcessEnv);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const ok = await fetch(base + '/api/health', { headers: { Origin: 'https://app.example.com' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.com');
    const other = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(base + '/api/submissions', { method: 'OPTIONS', headers: { Origin: 'https://app.example.com' } });
    assert.equal(pre.status, 204);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
