import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';

// Regression test for a bug found while building the Courses feature: RolesGuard used to read
// role metadata via reflector.get(key, handler) only, which never sees metadata attached by a
// class-level @Roles(...) decorator — silently denying every non-Super-Admin request on any
// controller using that (already-shipped, e.g. DepartmentsController) pattern.
describe('RolesGuard', () => {
  function contextFor(
    user: { role: Role },
    handler: () => void,
    controllerClass: Function,
  ) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => controllerClass,
    } as any;
  }

  it('allows a role granted via a class-level @Roles decorator', () => {
    @Roles(Role.ADMIN)
    class FakeController {
      handler() {}
    }
    const guard = new RolesGuard(new Reflector());
    const ctx = contextFor(
      { role: Role.ADMIN },
      FakeController.prototype.handler,
      FakeController,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies a role not covered by a class-level @Roles decorator', () => {
    @Roles(Role.ADMIN)
    class FakeController {
      handler() {}
    }
    const guard = new RolesGuard(new Reflector());
    const ctx = contextFor(
      { role: Role.USER },
      FakeController.prototype.handler,
      FakeController,
    );
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('lets a method-level @Roles decorator override the class-level one', () => {
    @Roles(Role.ADMIN)
    class FakeController {
      @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
      handler() {}
    }
    const guard = new RolesGuard(new Reflector());
    const ctx = contextFor(
      { role: Role.USER },
      FakeController.prototype.handler,
      FakeController,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('always allows Super Admin regardless of the roles list', () => {
    @Roles(Role.ADMIN)
    class FakeController {
      handler() {}
    }
    const guard = new RolesGuard(new Reflector());
    const ctx = contextFor(
      { role: Role.SUPER_ADMIN },
      FakeController.prototype.handler,
      FakeController,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
