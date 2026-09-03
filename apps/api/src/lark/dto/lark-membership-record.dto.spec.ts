import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LarkBulkSyncDto } from './lark-bulk-sync.dto';
import { LarkMembershipRecordDto } from './lark-membership-record.dto';

function validRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    larkRecordId: 'recXXXX',
    fullName: 'Jane Tan',
    email: 'jane@example.com',
    tier: '10K Silver',
    status: '生效中',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    amount: 1000,
    pendingCommission: 0,
    approvedCommission: 0,
    totalCommission: 0,
    ...overrides,
  };
}

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(LarkMembershipRecordDto, plain);
  return validate(dto);
}

describe('LarkMembershipRecordDto', () => {
  it('accepts a fully valid record', async () => {
    expect(await validateDto(validRecord())).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validateDto(validRecord({ email: 'not-an-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a non-ISO date', async () => {
    const errors = await validateDto(validRecord({ startDate: 'not-a-date' }));
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('rejects a negative amount', async () => {
    const errors = await validateDto(validRecord({ amount: -1 }));
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects an unrecognized tier label', async () => {
    const errors = await validateDto(validRecord({ tier: 'Gold' }));
    expect(errors.some((e) => e.property === 'tier')).toBe(true);
  });

  it('rejects an unrecognized status label', async () => {
    const errors = await validateDto(validRecord({ status: 'Unknown' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('allows referredByEmail, referralCode, and larkUpdatedAt to be omitted', async () => {
    expect(await validateDto(validRecord())).toHaveLength(0);
  });
});

describe('LarkBulkSyncDto', () => {
  it('accepts a batch of 200 records', async () => {
    const dto = plainToInstance(LarkBulkSyncDto, {
      records: Array.from({ length: 200 }, (_, i) => validRecord({ larkRecordId: `rec${i}` })),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a batch of 201 records', async () => {
    const dto = plainToInstance(LarkBulkSyncDto, {
      records: Array.from({ length: 201 }, (_, i) => validRecord({ larkRecordId: `rec${i}` })),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'records')).toBe(true);
  });
});
