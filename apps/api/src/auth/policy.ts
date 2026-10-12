import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

/**
 * Every route must declare exactly one access policy. Routes without one are refused at
 * request time by the policy guard and rejected at start-up by the policy audit, so a
 * forgotten check fails loudly instead of exposing data.
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permission'; permissions: readonly Permission[] };

export const POLICY_METADATA = 'peopleforge:access-policy';

/** Reachable without signing in. Reserved for health probes. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata<string, AccessPolicy>(POLICY_METADATA, { kind: 'public' });

/** Any signed-in user, whatever their role (e.g. "who am I"). */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata<string, AccessPolicy>(POLICY_METADATA, { kind: 'authenticated' });

/** Signed-in user holding every listed permission through their roles. */
export const RequirePermission = (
  ...permissions: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator =>
  SetMetadata<string, AccessPolicy>(POLICY_METADATA, { kind: 'permission', permissions });
