import { describe, expect, it } from 'vitest';
import {
  createFamilyMemberSchema,
  updateSelfSchema,
} from '../../src/modules/employees/employees.validation';

describe('phone validation (updateSelfSchema)', () => {
  it('accepts digits only', () => {
    expect(updateSelfSchema.safeParse({ phone: '9876543210' }).success).toBe(true);
  });

  it('accepts a formatted international number', () => {
    expect(updateSelfSchema.safeParse({ phone: '+91 98765 43210' }).success).toBe(true);
    expect(updateSelfSchema.safeParse({ phone: '(022) 1234-5678' }).success).toBe(true);
  });

  it('rejects junk characters', () => {
    const result = updateSelfSchema.safeParse({ phone: '!!!' });
    expect(result.success).toBe(false);
  });

  it('rejects an alphabetic value', () => {
    expect(updateSelfSchema.safeParse({ phone: 'call-me' }).success).toBe(false);
  });

  it('treats an empty string as a clear (null)', () => {
    const result = updateSelfSchema.safeParse({ phone: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeNull();
  });

  it('allows the field to be omitted', () => {
    expect(updateSelfSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a value over 20 characters', () => {
    expect(updateSelfSchema.safeParse({ phone: '1'.repeat(25) }).success).toBe(false);
  });
});

describe('phone validation (family member)', () => {
  it('accepts a valid phone and rejects junk', () => {
    expect(
      createFamilyMemberSchema.safeParse({ name: 'Kin', relationship: 'Sibling', phone: '9876543210' })
        .success,
    ).toBe(true);
    expect(
      createFamilyMemberSchema.safeParse({ name: 'Kin', relationship: 'Sibling', phone: '??' }).success,
    ).toBe(false);
  });
});
