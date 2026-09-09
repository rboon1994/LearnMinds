import 'reflect-metadata';
import { MembershipStatus } from '@prisma/client';
import {
  NON_MEMBER_TIER,
  mapStatusLabel,
  resolveEffectiveStatus,
  shouldWriteTier,
} from './membership-labels';

describe('membership-labels', () => {
  it('mapStatusLabel maps all three known Chinese labels', () => {
    expect(mapStatusLabel('待启用')).toBe(MembershipStatus.PENDING);
    expect(mapStatusLabel('生效中')).toBe(MembershipStatus.ACTIVE);
    expect(mapStatusLabel('已过期')).toBe(MembershipStatus.EXPIRED);
  });

  it('mapStatusLabel throws on 已退会 (removed — no longer a valid Lark label)', () => {
    expect(() => mapStatusLabel('已退会')).toThrow();
  });

  it('mapStatusLabel throws on an unrecognized label', () => {
    expect(() => mapStatusLabel('未知状态')).toThrow();
  });

  it('mapStatusLabel throws on prototype chain keys (defense against bypass)', () => {
    expect(() => mapStatusLabel('constructor')).toThrow();
    expect(() => mapStatusLabel('toString')).toThrow();
    expect(() => mapStatusLabel('hasOwnProperty')).toThrow();
  });

  it('resolveEffectiveStatus forces EXPIRED when tier is 非会员, regardless of the status label', () => {
    expect(resolveEffectiveStatus(NON_MEMBER_TIER, '生效中')).toBe(
      MembershipStatus.EXPIRED,
    );
    expect(resolveEffectiveStatus(NON_MEMBER_TIER, '待启用')).toBe(
      MembershipStatus.EXPIRED,
    );
  });

  it('resolveEffectiveStatus maps the status label normally for a real tier', () => {
    expect(resolveEffectiveStatus('10K Silver', '生效中')).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('shouldWriteTier is false only for 非会员', () => {
    expect(shouldWriteTier(NON_MEMBER_TIER)).toBe(false);
    expect(shouldWriteTier('10K Silver')).toBe(true);
    expect(shouldWriteTier('50K Unlimited')).toBe(true);
  });
});
