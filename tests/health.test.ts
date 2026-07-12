import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('GET /health returns 200 with status ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: 'ok' });
});
