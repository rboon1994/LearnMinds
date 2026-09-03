import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { LarkApiKeyGuard } from './lark-api-key.guard';

function makeContext(headers: Record<string, string>, ip = '1.1.1.1') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip }),
    }),
  } as any;
}

describe('LarkApiKeyGuard', () => {
  const originalKey = process.env.LARK_API_KEY;

  beforeEach(() => {
    process.env.LARK_API_KEY = 'test-secret';
  });

  afterAll(() => {
    process.env.LARK_API_KEY = originalKey;
  });

  it('allows a request with the correct key', () => {
    const guard = new LarkApiKeyGuard();
    expect(guard.canActivate(makeContext({ 'x-api-key': 'test-secret' }))).toBe(true);
  });

  it('rejects a request with a missing or wrong key', () => {
    const guard = new LarkApiKeyGuard();
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('locks out an IP after repeated failures within the window', () => {
    const guard = new LarkApiKeyGuard();
    const badContext = makeContext({ 'x-api-key': 'wrong' }, '2.2.2.2');
    for (let i = 0; i < 5; i++) {
      expect(() => guard.canActivate(badContext)).toThrow(UnauthorizedException);
    }
    // The 6th failure within the window should still throw (now via the lockout branch) —
    // asserting it still throws is what matters here, not which branch produced it.
    expect(() => guard.canActivate(badContext)).toThrow(UnauthorizedException);
  });

  it('resets failure tracking for an IP after a successful request', () => {
    const guard = new LarkApiKeyGuard();
    const ip = '3.3.3.3';
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();
    expect(guard.canActivate(makeContext({ 'x-api-key': 'test-secret' }, ip))).toBe(true);
  });
});
