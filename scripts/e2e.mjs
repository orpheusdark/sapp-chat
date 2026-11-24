import { chromium, expect } from '@playwright/test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApplication } from '../backend/src/app.js';
import { initializeModels, Message } from '../backend/src/models.js';
import { seed } from '../backend/src/seed.js';

let mongo, runtime, vite, browser;
const password = 'LocalE2E-Password!42';
const errors = [];
try {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  await seed(password);
  runtime = createApplication(
    {
      NODE_ENV: 'test',
      JWT_SECRET: 'e2e-only-secret-with-at-least-32-characters',
      TRUST_PROXY: '0',
      origins: ['http://127.0.0.1:4178'],
    },
    {
      // Exercise multipart validation, persistence and rendering without production credentials.
      storage: {
        upload: async (buffer) => ({
          url: `data:image/png;base64,${buffer.toString('base64')}`,
          publicId: 'e2e-only-image',
          width: 1,
          height: 1,
        }),
        destroy: async () => {},
      },
    },
  );
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  process.env.VITE_API_URL = apiUrl;
  vite = await createServer({
    root: resolve('frontend'),
    configFile: resolve('frontend/vite.config.js'),
    server: { host: '127.0.0.1', port: 4178, strictPort: true },
  });
  await vite.listen();
  const web = 'http://127.0.0.1:4178';
  expect((await fetch(web)).status).toBe(200);
  browser = await chromium.launch({ headless: true });
  const alexContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const jamieContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const alex = await alexContext.newPage(),
    jamie = await jamieContext.newPage();
  for (const page of [alex, jamie])
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('Browser runtime error:', e.message, e.stack);
    });
  async function login(page, email) {
    await page.goto(web);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  }
  await mkdir('artifacts', { recursive: true });
  await alex.goto(web);
  await alex.screenshot({ path: 'artifacts/login-desktop.png', fullPage: true });
  await login(alex, 'alex@sapphire.test');
  await login(jamie, 'jamie@sapphire.test');
  await alex.locator('.conversation-row').filter({ hasText: 'Jamie Chen' }).click();
  await expect(
    alex
      .locator('.message-scroll')
      .getByText('The best kind of afternoon. See you at 3!', { exact: true }),
  ).toBeVisible();
  await jamie.locator('.conversation-row').filter({ hasText: 'Alex Morgan' }).click();
  await expect(jamie.locator('.message-bubble').last()).toBeVisible();
  await expect(
    jamie.locator('.conversation-row').filter({ hasText: 'Alex Morgan' }).locator('.unread-badge'),
  ).toHaveCount(0);
  await alex.screenshot({ path: 'artifacts/chat-desktop.png', fullPage: true });
  await jamie.getByRole('button', { name: 'Messages', exact: true }).click();
  await alex
    .getByLabel('Message', { exact: true })
    .fill('A real-time hello from the browser test.');
  await alex.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    jamie.locator('.conversation-row').filter({ hasText: 'Alex Morgan' }).locator('.unread-badge'),
  ).toHaveText('1');
  await jamie.locator('.conversation-row').filter({ hasText: 'Alex Morgan' }).click();
  await expect(
    jamie
      .locator('.message-scroll')
      .getByText('A real-time hello from the browser test.', { exact: true }),
  ).toBeVisible();
  await expect(
    jamie.locator('.conversation-row').filter({ hasText: 'Alex Morgan' }).locator('.unread-badge'),
  ).toHaveCount(0);
  await alex.getByLabel('Message', { exact: true }).fill('Draft in progress');
  await expect(jamie.locator('.typing-line')).toContainText('Alex Morgan is typing');
  await alex.getByLabel('Message', { exact: true }).fill('');
  await expect(jamie.locator('.typing-line')).toHaveText('', { timeout: 6000 });
  console.log('PASS two-user login, live messaging, presence, typing and unread/read state');

  await alex.getByRole('button', { name: 'Create group', exact: true }).click();
  await alex.getByLabel('Group name').fill('Browser test team');
  await alex.getByLabel('Search people', { exact: true }).fill('Jamie');
  await alex.locator('.person-result').filter({ hasText: 'Jamie Chen' }).click();
  await alex.getByLabel('Search people', { exact: true }).fill('Sofia');
  await alex.locator('.person-result').filter({ hasText: 'Sofia Rivera' }).click();
  await alex.getByRole('button', { name: /Create group · 3 people/ }).click();
  await expect(alex.getByRole('heading', { name: 'Browser test team' })).toBeVisible();
  await alex.getByRole('button', { name: 'Conversation details', exact: true }).click();
  await alex.getByRole('button', { name: 'Add people', exact: true }).click();
  await alex.getByLabel('Search people', { exact: true }).fill('Noah');
  await alex.locator('.person-result').filter({ hasText: 'Noah Williams' }).click();
  await expect(alex.locator('.details-panel')).toContainText('Noah Williams');
  await jamie.locator('.conversation-row').filter({ hasText: 'Browser test team' }).click();
  await jamie.getByRole('button', { name: 'Conversation details', exact: true }).click();
  await expect(jamie.getByRole('button', { name: 'Add people', exact: true })).toHaveCount(0);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=',
    'base64',
  );
  await alex
    .getByLabel('Share an image', { exact: true })
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await alex.getByLabel('Message', { exact: true }).fill('An image for the whole team');
  await alex.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(jamie.locator('.message-bubble img')).toBeVisible();
  await expect(
    jamie.locator('.message-scroll').getByText('An image for the whole team', { exact: true }),
  ).toBeVisible();
  await expect(alex.locator('.attachment-preview')).toHaveCount(0);
  await expect(alex.getByLabel('Message', { exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
  console.log(
    'PASS group creation, admin member addition and image message end to end (cloud storage stubbed)',
  );

  const session = await alex.evaluate(() => JSON.parse(sessionStorage.getItem('sapphire-session')));
  const group = await mongoose.model('Conversation').findOne({ name: 'Browser test team' });
  await jamieContext.setOffline(true);
  for (const socket of runtime.io.sockets.sockets.values())
    if (String(socket.data.user._id) === group.members[1].toString()) socket.conn.close();
  for (let i = 0; i < 36; i++) {
    const response = await fetch(`${apiUrl}/api/conversations/${group._id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Reconnect catch-up ${i}`, clientId: crypto.randomUUID() }),
    });
    expect(response.status).toBe(201);
  }
  await jamieContext.setOffline(false);
  await expect(
    jamie.locator('.message-scroll').getByText('Reconnect catch-up 0', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    jamie.locator('.message-scroll').getByText('Reconnect catch-up 35', { exact: true }),
  ).toBeVisible();
  await jamie.reload();
  await jamie.locator('.conversation-row').filter({ hasText: 'Browser test team' }).click();
  await jamie.getByRole('button', { name: 'Load earlier messages' }).click();
  await expect(
    jamie.locator('.message-scroll').getByText('Reconnect catch-up 0', { exact: true }),
  ).toBeVisible();
  expect(await Message.countDocuments({ conversation: group._id })).toBe(37);
  console.log('PASS long-disconnect catch-up, persisted refresh and paginated history');

  await alex.setViewportSize({ width: 390, height: 844 });
  await alex.screenshot({ path: 'artifacts/mobile-before-navigation.png', fullPage: true });
  await alex.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await alex.screenshot({ path: 'artifacts/chat-mobile-list.png', fullPage: true });
  await alex.locator('.conversation-row').filter({ hasText: 'Jamie Chen' }).click();
  await alex.screenshot({ path: 'artifacts/chat-mobile.png', fullPage: true });
  expect(await alex.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await alex.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await alex.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(alex.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS mobile layout, navigation and sign out; no browser runtime errors');
} finally {
  await browser?.close();
  await vite?.close();
  if (runtime) await new Promise((resolve) => runtime.io.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
}
