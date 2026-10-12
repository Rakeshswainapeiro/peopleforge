import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../errors/domain-errors.js';
import { getPrincipal } from '../http/locals.js';
import { hasAllPermissions } from './permissions.js';
import { POLICY_METADATA, type AccessPolicy } from './policy.js';

/**
 * Global guard (deny by default). Method-level policy wins over class-level policy; a route
 * with neither is refused even if a principal is present.
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(POLICY_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (policy === undefined) {
      throw new ForbiddenError('Route has no access policy');
    }
    if (policy.kind === 'public') {
      return true;
    }

    const principal = getPrincipal(context.switchToHttp().getResponse<Response>());
    if (principal === undefined) {
      throw new UnauthenticatedError('Authentication required');
    }
    if (policy.kind === 'permission' && !hasAllPermissions(principal.roles, policy.permissions)) {
      throw new ForbiddenError('Missing permission');
    }
    return true;
  }
}
