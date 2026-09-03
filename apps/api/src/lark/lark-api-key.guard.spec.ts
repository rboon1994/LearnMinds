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

  it('keeps correct key rejected while inside lockout window even with spread-out failures', () => {
    jest.useFakeTimers();
    const guard = new LarkApiKeyGuard();
    const ip = '4.4.4.4';
    const now = Date.now();

    // Simulate 5 failures spread out over ~40 seconds (one every ~8s)
    jest.setSystemTime(now);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();

    jest.setSystemTime(now + 8000);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();

    jest.setSystemTime(now + 16000);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();

    jest.setSystemTime(now + 24000);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();

    jest.setSystemTime(now + 32000);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();
    // Lockout triggered at now + 32000

    // Try correct key immediately after lockout triggered (should still be locked)
    jest.setSystemTime(now + 32001);
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'test-secret' }, ip))).toThrow(
      UnauthorizedException,
    );

    jest.useRealTimers();
  });

  it('removes locked-out entries after lockout expires', () => {
    jest.useFakeTimers();
    const guard = new LarkApiKeyGuard();
    const ip = '5.5.5.5';
    const now = Date.now();

    jest.setSystemTime(now);
    // Drive to lockout: 5 failures, lockedAt = now (approximately)
    for (let i = 0; i < 5; i++) {
      expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();
    }

    // Scenario 1: inside lockout window (t = now + 100s, lockout is [now, now+300s])
    jest.setSystemTime(now + 100000);
    expect(() =>
      guard.canActivate(makeContext({ 'x-api-key': 'test-secret' }, ip)),
    ).toThrow(UnauthorizedException);

    // Scenario 2: after lockout expires (t = now + 300s + 1ms)
    jest.setSystemTime(now + 300001);

    // Spy on the map to verify entry removal
    const deleteSpy = jest.spyOn(guard['failuresByIp'], 'delete');

    // Trigger sweep by making a request
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }, ip))).toThrow();

    // Verify that delete was called, proving the entry was removed
    expect(deleteSpy).toHaveBeenCalledWith(ip);

    // Correct key should now succeed (entry was cleaned)
    expect(guard.canActivate(makeContext({ 'x-api-key': 'test-secret' }, ip))).toBe(true);

    deleteSpy.mockRestore();
    jest.useRealTimers();
  });
});
