import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../../src/config/prisma', () => ({
  prisma: { expenseCategory: { findMany } },
}));

import { validatePolicy } from '../../src/modules/expenses/expense.service';

function category(overrides: Partial<{ id: string; name: string; active: boolean; maxAmount: number | null; receiptRequiredAbove: number | null }> = {}) {
  return {
    id: 'cat-1',
    name: 'Travel',
    active: true,
    maxAmount: null,
    receiptRequiredAbove: null,
    ...overrides,
  };
}

describe('validatePolicy', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('rejects an empty set of lines without querying categories', async () => {
    await expect(validatePolicy([], false)).rejects.toThrow(/at least one expense line/i);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('accepts a line within the category cap', async () => {
    findMany.mockResolvedValue([category({ maxAmount: 1000 })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 800, hasReceipt: false }], false)).resolves.toBeUndefined();
  });

  it('rejects a category that does not exist', async () => {
    findMany.mockResolvedValue([]);
    await expect(validatePolicy([{ categoryId: 'missing', amount: 100, hasReceipt: false }], false)).rejects.toThrow(
      /does not exist/i,
    );
  });

  it('rejects an inactive category', async () => {
    findMany.mockResolvedValue([category({ active: false })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 100, hasReceipt: false }], false)).rejects.toThrow(
      /no longer active/i,
    );
  });

  it('rejects a line above the per-category maximum', async () => {
    findMany.mockResolvedValue([category({ maxAmount: 500 })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 800, hasReceipt: false }], false)).rejects.toThrow(
      /exceeds the Travel limit/i,
    );
  });

  it('requires a receipt above the threshold when receipts are enforced', async () => {
    findMany.mockResolvedValue([category({ receiptRequiredAbove: 500 })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 800, hasReceipt: false }], true)).rejects.toThrow(
      /receipt is required/i,
    );
  });

  it('accepts a line above the threshold when a receipt is attached', async () => {
    findMany.mockResolvedValue([category({ receiptRequiredAbove: 500 })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 800, hasReceipt: true }], true)).resolves.toBeUndefined();
  });

  it('does not enforce receipts while the claim is still a draft', async () => {
    findMany.mockResolvedValue([category({ receiptRequiredAbove: 500 })]);
    await expect(validatePolicy([{ categoryId: 'cat-1', amount: 800, hasReceipt: false }], false)).resolves.toBeUndefined();
  });

  it('reports the offending line number', async () => {
    findMany.mockResolvedValue([category({ id: 'cat-1' }), category({ id: 'cat-2', maxAmount: 100 })]);
    await expect(
      validatePolicy(
        [
          { categoryId: 'cat-1', amount: 50, hasReceipt: false },
          { categoryId: 'cat-2', amount: 500, hasReceipt: false },
        ],
        false,
      ),
    ).rejects.toThrow(/Line 2/);
  });
});
