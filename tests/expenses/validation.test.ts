import { describe, expect, it } from 'vitest';
import {
  categorySchema,
  createClaimSchema,
  decisionSchema,
  expenseItemSchema,
  listClaimsQuerySchema,
  reimburseSchema,
  reportQuerySchema,
  updateClaimSchema,
} from '../../src/modules/expenses/expense.validation';

const validItem = { categoryId: 'cat-1', expenseDate: '2026-11-01', amount: 250.5 };

describe('expense validation schemas', () => {
  describe('expenseItemSchema', () => {
    it('coerces the expense date and amount', () => {
      const result = expenseItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expenseDate).toBeInstanceOf(Date);
        expect(result.data.amount).toBe(250.5);
      }
    });

    it('rejects a non-positive amount', () => {
      expect(expenseItemSchema.safeParse({ ...validItem, amount: 0 }).success).toBe(false);
      expect(expenseItemSchema.safeParse({ ...validItem, amount: -10 }).success).toBe(false);
    });

    it('rejects a missing category', () => {
      expect(expenseItemSchema.safeParse({ ...validItem, categoryId: '' }).success).toBe(false);
    });

    it('rejects an invalid date', () => {
      expect(expenseItemSchema.safeParse({ ...validItem, expenseDate: 'not-a-date' }).success).toBe(false);
    });
  });

  describe('createClaimSchema', () => {
    it('accepts a well-formed claim', () => {
      const result = createClaimSchema.safeParse({ title: 'Client visit', items: [validItem] });
      expect(result.success).toBe(true);
    });

    it('requires at least one expense line', () => {
      expect(createClaimSchema.safeParse({ title: 'Client visit', items: [] }).success).toBe(false);
    });

    it('rejects a title shorter than three characters', () => {
      expect(createClaimSchema.safeParse({ title: 'ab', items: [validItem] }).success).toBe(false);
    });

    it('upper-cases a three-letter currency', () => {
      const result = createClaimSchema.safeParse({ title: 'Client visit', currency: 'inr', items: [validItem] });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currency).toBe('INR');
    });

    it('rejects a currency that is not three letters', () => {
      expect(createClaimSchema.safeParse({ title: 'Client visit', currency: 'rupees', items: [validItem] }).success).toBe(false);
    });
  });

  describe('updateClaimSchema', () => {
    it('accepts a partial update', () => {
      expect(updateClaimSchema.safeParse({ title: 'Renamed claim' }).success).toBe(true);
      expect(updateClaimSchema.safeParse({}).success).toBe(true);
    });

    it('still validates supplied items', () => {
      expect(updateClaimSchema.safeParse({ items: [] }).success).toBe(false);
    });
  });

  describe('decisionSchema', () => {
    it('accepts the three decision outcomes', () => {
      for (const decision of ['APPROVED', 'REJECTED', 'CLARIFICATION']) {
        expect(decisionSchema.safeParse({ decision }).success).toBe(true);
      }
    });

    it('rejects an unknown decision', () => {
      expect(decisionSchema.safeParse({ decision: 'MAYBE' }).success).toBe(false);
    });
  });

  describe('reimburseSchema', () => {
    it('requires a payment mode', () => {
      expect(reimburseSchema.safeParse({ reference: 'UTR1' }).success).toBe(false);
      expect(reimburseSchema.safeParse({ paymentMode: 'BANK_TRANSFER', reference: 'UTR1' }).success).toBe(true);
    });
  });

  describe('categorySchema', () => {
    it('accepts null to clear a limit', () => {
      const result = categorySchema.safeParse({ name: 'Travel', maxAmount: null, receiptRequiredAbove: 500 });
      expect(result.success).toBe(true);
    });

    it('rejects a negative limit', () => {
      expect(categorySchema.safeParse({ name: 'Travel', maxAmount: -1 }).success).toBe(false);
    });

    it('requires a name of at least two characters', () => {
      expect(categorySchema.safeParse({ name: 'X' }).success).toBe(false);
    });
  });

  describe('list + report query schemas', () => {
    it('applies pagination defaults', () => {
      const result = listClaimsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
      }
    });

    it('coerces page numbers from query strings', () => {
      const result = listClaimsQuerySchema.safeParse({ page: '3', pageSize: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.pageSize).toBe(50);
      }
    });

    it('rejects a page size above the cap', () => {
      expect(listClaimsQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    });

    it('coerces report date filters', () => {
      const result = reportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.from).toBeInstanceOf(Date);
        expect(result.data.to).toBeInstanceOf(Date);
      }
    });

    it('rejects an unknown status filter', () => {
      expect(listClaimsQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
    });
  });
});
