import { describe, expect, it } from 'vitest';
import { createEventSchema, updateEventSchema } from '../../src/modules/events/event.validation';

const base = { title: 'Team Outing', date: '2031-06-01T10:00:00.000Z' };

describe('event validation schemas', () => {
  describe('createEventSchema', () => {
    it('accepts an event without an end date', () => {
      expect(createEventSchema.safeParse(base).success).toBe(true);
    });

    it('accepts a null end date (the UI sends null when the field is empty)', () => {
      const result = createEventSchema.safeParse({ ...base, endDate: null });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.endDate).toBeNull();
    });

    it('accepts an empty string end date and normalises it to null', () => {
      const result = createEventSchema.safeParse({ ...base, endDate: '' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.endDate).toBeNull();
    });

    it('accepts a valid end date', () => {
      const result = createEventSchema.safeParse({ ...base, endDate: '2031-06-01T12:00:00.000Z' });
      expect(result.success).toBe(true);
    });

    it('rejects an unparseable end date', () => {
      expect(createEventSchema.safeParse({ ...base, endDate: 'not-a-date' }).success).toBe(false);
    });

    it('rejects a title shorter than three characters', () => {
      expect(createEventSchema.safeParse({ ...base, title: 'ab' }).success).toBe(false);
    });
  });

  describe('updateEventSchema', () => {
    it('accepts a null end date so an event can be cleared', () => {
      expect(updateEventSchema.safeParse({ endDate: null }).success).toBe(true);
    });
  });
});
