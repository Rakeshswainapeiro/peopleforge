import 'reflect-metadata';
import { afterEach } from 'vitest';
import { closeTrackedApps } from './test-support/factory.js';

afterEach(async () => {
  await closeTrackedApps();
});
