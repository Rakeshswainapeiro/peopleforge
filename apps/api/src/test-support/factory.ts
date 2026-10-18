import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { pino, type Logger } from 'pino';
import { ApiErrorSchema, type ApiError } from '@sirius/shared-types';
import type {
  DashboardRepository,
  EntityDirectory,
  IncrementRequestRepository,
  NotificationRepository,
  ReviewRepository,
  ConversationRepository,
  ReportRepository,
  AuditTrailRepository,
} from '@peopleforge/db';
import type { MalwareScanner, ObjectStore } from '@peopleforge/integrations';
import type { Principal } from '../auth/principal.js';
import type { AppDependencies } from '../bootstrap/app.module.js';
import { createApp } from '../bootstrap/create-app.js';
import { loadEnv, type Env } from '../config/env.js';

const tracked: INestApplication[] = [];

/** Apps created in a test are closed after it by test-setup.ts, so tests can't leak servers. */
export function track<T extends INestApplication>(app: T): T {
  tracked.push(app);
  return app;
}

export async function closeTrackedApps(): Promise<void> {
  const apps = tracked.splice(0);
  await Promise.all(apps.map((app) => app.close()));
}

/** Identity settings matching `createTestIssuer({ audience: TEST_AUDIENCE })` defaults. */
export const TEST_AUDIENCE = 'peopleforge-api';
export const TEST_TENANT = '00000000-0000-4000-8000-0000000000aa';
export const TEST_ISSUER = `https://login.example.test/${TEST_TENANT}/v2.0`;

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    OIDC_ISSUER: TEST_ISSUER,
    OIDC_AUDIENCE: TEST_AUDIENCE,
    OIDC_TENANT_ID: TEST_TENANT,
    DATABASE_URL: 'postgres://peopleforge_app@localhost:5432/peopleforge_test',
    DATA_ENCRYPTION_KEYS: `test-1:${Buffer.alloc(32, 7).toString('base64')}`,
    DATA_ENCRYPTION_ACTIVE_KEY: 'test-1',
    // Never touched by these settings alone: tests inject their own store and scanner.
    OBJECT_STORE_DRIVER: 'filesystem',
    OBJECT_STORE_DIR: '/nonexistent/peopleforge-test',
    MALWARE_SCANNER: 'none',
    ...overrides,
  });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

type Resolver = AppDependencies['resolvePrincipal'];

export const SUB_A = '00000000-0000-4000-8000-0000000e000a';
export const SUB_B = '00000000-0000-4000-8000-0000000e000b';
const ENTITIES = [
  { id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } },
  { id: SUB_B, code: 'SUB-B', name: { en: 'Subsidiary B' } },
];

/**
 * In-memory stand-in for the database directory, applying the same rule as Row-Level Security
 * (packages/db proves the real one). `assignments` maps user ID → entity IDs.
 */
export function fakeDirectory(assignments: Record<string, string[]> = {}): EntityDirectory {
  const byUser = new Map(Object.entries(assignments));
  return {
    assignedEntityIds: (userId) => Promise.resolve(byUser.get(userId) ?? []),
    entities: (scope) =>
      Promise.resolve(
        ENTITIES.filter((entity) => scope.kind === 'group' || scope.entityIds.includes(entity.id)),
      ),
  };
}

/**
 * Increment request repository whose every call fails: tests that reach it replace the methods
 * they need (`vi.fn()`), so an unexpected call is loud.
 */
export function unusedRepository(): IncrementRequestRepository {
  const fail = () => Promise.reject(new Error('repository not expected in this test'));
  return {
    openCycles: fail,
    searchEmployees: fail,
    create: fail,
    get: fail,
    addLine: fail,
    removeLine: fail,
    saveDraft: fail,
    addEvidence: fail,
    removeEvidence: fail,
    getEvidence: fail,
    submit: fail,
    recordAction: fail,
  };
}

/** Object store and scanner for tests that never reach them: any call fails loudly. */
const unexpected = (): Promise<never> =>
  Promise.reject(new Error('dependency not expected in this test'));
export const unusedObjectStore: ObjectStore = {
  put: unexpected,
  get: unexpected,
  remove: unexpected,
  ping: unexpected,
};
export const unusedScanner: MalwareScanner = {
  engine: 'unused',
  scan: unexpected,
  ping: unexpected,
};

export const unusedDashboard: DashboardRepository = {
  summary: unexpected,
  requests: unexpected,
  lines: unexpected,
};

export const unusedReview: ReviewRepository = {
  verify: unexpected,
  decide: unexpected,
  resubmit: unexpected,
  queue: unexpected,
};

export const unusedConversations: ConversationRepository = {
  thread: unexpected,
  post: unexpected,
  threads: unexpected,
};

export const unusedReports: ReportRepository = { incrementLines: unexpected };

export const unusedAuditTrail: AuditTrailRepository = {
  requestHistory: unexpected,
  trail: unexpected,
};

export const unusedNotifications: NotificationRepository = {
  list: unexpected,
  markRead: unexpected,
};

/** A directory whose database is down. */
export const brokenDirectory: EntityDirectory = {
  assignedEntityIds: () => Promise.reject(new Error('connection refused')),
  entities: () => Promise.reject(new Error('connection refused')),
};

/** Every request is made by this caller. */
export function resolveAs(principal: Principal): Resolver {
  return () => Promise.resolve(principal);
}

/** Every request is anonymous. */
export const anonymous: Resolver = () => Promise.resolve(null);

/** Parses a response body as the documented error shape, failing the test if it isn't. */
export function errorOf(response: { body: unknown }): ApiError['error'] {
  return ApiErrorSchema.parse(response.body).error;
}

export async function buildApp(
  overrides: Partial<AppDependencies> = {},
): Promise<NestExpressApplication> {
  return track(
    await createApp({
      env: testEnv(),
      logger: silentLogger(),
      resolvePrincipal: anonymous,
      directory: fakeDirectory(),
      incrementRequests: unusedRepository(),
      objectStore: unusedObjectStore,
      malwareScanner: unusedScanner,
      dashboard: unusedDashboard,
      review: unusedReview,
      conversations: unusedConversations,
      reports: unusedReports,
      auditTrail: unusedAuditTrail,
      notifications: unusedNotifications,
      readinessChecks: [],
      isShuttingDown: () => false,
      ...overrides,
    }),
  );
}
