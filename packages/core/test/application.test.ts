import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, countsAsValidSubmission } from '../src/application.js';

describe('application state machine', () => {
  it('allows the happy path', () => {
    const path = ['draft', 'filled', 'confirmed', 'submitted', 'verified', 'screening', 'interview', 'offer', 'closed'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });
  it('forbids skipping verification', () => {
    expect(canTransition('submitted', 'screening')).toBe(false);
    expect(() => assertTransition('submitted', 'interview')).toThrow(/illegal/);
  });
  it('closed is terminal', () => {
    expect(canTransition('closed', 'draft')).toBe(false);
  });
  it('only verified+ counts as valid submission', () => {
    expect(countsAsValidSubmission('submitted')).toBe(false);
    expect(countsAsValidSubmission('verified')).toBe(true);
    expect(countsAsValidSubmission('interview')).toBe(true);
    expect(countsAsValidSubmission('closed')).toBe(false);
  });
});
