import { describe, expect, it } from 'vitest';
import {
  isAllowedAppend,
  isAllowedWrite,
  normalizeQuestionsPayload,
} from '../lib/design-space-core.mjs';

describe('isAllowedWrite', () => {
  it('allows canvas state at known path', () => {
    expect(isAllowedWrite('.design-canvas.state.json')).toBe(true);
  });

  it('allows per-design agent-owned files', () => {
    expect(isAllowedWrite('designs/demo/tweaks.json')).toBe(true);
    expect(isAllowedWrite('designs/demo/comments.json')).toBe(true);
    expect(isAllowedWrite('designs/demo/questions.json')).toBe(true);
    expect(isAllowedWrite('designs/demo/overrides.json')).toBe(true);
    expect(isAllowedWrite('designs/demo/agent-feedback.md')).toBe(true);
    expect(isAllowedWrite('designs/demo/agent-inbox.json')).toBe(true);
    expect(isAllowedWrite('designs/demo/agent-inbox.md')).toBe(true);
    expect(isAllowedWrite('designs/demo/events.jsonl')).toBe(true);
  });

  it('rejects path traversal and arbitrary files', () => {
    expect(isAllowedWrite('designs/demo/Design.jsx')).toBe(false);
    expect(isAllowedWrite('designs/../package.json')).toBe(false);
    expect(isAllowedWrite('package.json')).toBe(false);
    expect(isAllowedWrite('designs/Demo/tweaks.json')).toBe(false); // uppercase rejected
    expect(isAllowedWrite('designs//tweaks.json')).toBe(false);
  });
});

describe('isAllowedAppend', () => {
  it('only allows events.jsonl', () => {
    expect(isAllowedAppend('designs/demo/events.jsonl')).toBe(true);
    expect(isAllowedAppend('designs/demo/tweaks.json')).toBe(false);
    expect(isAllowedAppend('designs/demo/Design.jsx')).toBe(false);
  });
});

describe('normalizeQuestionsPayload', () => {
  it('builds a pending payload from a questions array', () => {
    const result = normalizeQuestionsPayload({
      title: 'X',
      questions: [{ id: 'q', prompt: 'p', type: 'text' }],
    });
    expect(result.status).toBe('pending');
    expect(result.trigger).toBe('open');
    expect(result.questions).toHaveLength(1);
    expect(result.title).toBe('X');
  });

  it('accepts a bare questions array', () => {
    const result = normalizeQuestionsPayload([{ id: 'q', prompt: 'p', type: 'text' }]);
    expect(result.title).toBe('Refinement questions');
    expect(result.questions).toHaveLength(1);
  });

  it('throws on an empty payload', () => {
    expect(() => normalizeQuestionsPayload({})).toThrow(/non-empty/);
    expect(() => normalizeQuestionsPayload({ questions: [] })).toThrow(/non-empty/);
  });
});
