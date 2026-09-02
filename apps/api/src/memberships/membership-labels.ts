import { MembershipStatus } from '@prisma/client';

export const NON_MEMBER_TIER = '非会员';
export const TIER_OPTIONS = [NON_MEMBER_TIER, '10K Silver', '50K Unlimited'] as const;
export const STATUS_OPTIONS = ['待启用', '生效中', '已过期', '已退会'] as const;

const STATUS_LABEL_MAP = Object.create(null) as Record<
  (typeof STATUS_OPTIONS)[number],
  MembershipStatus
>;
STATUS_LABEL_MAP['待启用'] = MembershipStatus.PENDING;
STATUS_LABEL_MAP['生效中'] = MembershipStatus.ACTIVE;
STATUS_LABEL_MAP['已过期'] = MembershipStatus.EXPIRED;
STATUS_LABEL_MAP['已退会'] = MembershipStatus.CANCELLED;

// Defense in depth — DTO validation (@IsIn) is the primary gate against an unrecognized label
// reaching this function at all, but this still throws rather than silently defaulting if it
// ever does (e.g. a future call site that bypasses the DTO).
export function mapStatusLabel(label: string): MembershipStatus {
  const status = STATUS_LABEL_MAP[label as (typeof STATUS_OPTIONS)[number]];
  if (!status) {
    throw new Error(`Unrecognized Membership status label: ${label}`);
  }
  return status;
}

// tier=非会员 is treated purely as a signal, never as data — see resolveEffectiveStatus and
// shouldWriteTier below, and the "Cancellation / downgrade" section of the design spec.
export function resolveEffectiveStatus(
  tier: string,
  statusLabel: string,
): MembershipStatus {
  if (tier === NON_MEMBER_TIER) return MembershipStatus.CANCELLED;
  return mapStatusLabel(statusLabel);
}

export function shouldWriteTier(tier: string): boolean {
  return tier !== NON_MEMBER_TIER;
}
