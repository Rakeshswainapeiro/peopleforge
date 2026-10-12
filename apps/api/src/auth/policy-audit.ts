import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { POLICY_METADATA } from './policy.js';

/** The class/handler type Nest's Reflector accepts as a metadata target. */
type ReflectTarget = Parameters<Reflector['getAllAndOverride']>[1][number];

export class MissingPolicyError extends Error {
  constructor(readonly routes: readonly string[]) {
    super(`Routes without an access policy: ${routes.join(', ')}`);
    this.name = 'MissingPolicyError';
  }
}

function isRouteHandler(target: object): boolean {
  return Reflect.hasMetadata(PATH_METADATA, target) && Reflect.hasMetadata(METHOD_METADATA, target);
}

function describe(controller: string, handler: string): string {
  return `${controller}.${handler}`;
}

/**
 * Lists every controller route that declares no access policy (on the method or its class).
 * Called at start-up so a route can never ship unprotected by omission.
 */
export function findRoutesWithoutPolicy(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const missing: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const prototype = Object.getPrototypeOf(wrapper.instance) as Record<string, unknown>;
    const controllerClass = prototype.constructor as ReflectTarget;
    const controllerName = String(wrapper.name);

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler: unknown = Reflect.get(prototype, name);
      if (typeof handler !== 'function' || !isRouteHandler(handler)) continue;
      const policy = reflector.getAllAndOverride<unknown>(POLICY_METADATA, [
        handler as ReflectTarget,
        controllerClass,
      ]);
      if (policy === undefined) missing.push(describe(controllerName, name));
    }
  }
  return missing;
}

export function assertEveryRouteHasPolicy(app: INestApplication): void {
  const missing = findRoutesWithoutPolicy(app);
  if (missing.length > 0) throw new MissingPolicyError(missing);
}
