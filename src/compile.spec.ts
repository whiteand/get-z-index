import { describe, expect } from 'vitest';
import {
  AbsentLayerError,
  compile,
  LayerIndexOutOfBoundsError,
  RuleConflictError,
  safeCompile,
  ZIndexProvider,
} from './index';

describe('compile', (it) => {
  it('compiles with empty rules', () => {
    const res = compile([]);
    expect(res.zIndexDict).toMatchInlineSnapshot(`{}`);
  });

  it('assigns z-indices from a simple chain', () => {
    const getZIndex = compile([
      ['page', 'header'],
      ['header', 'modals'],
      ['modals', 'notifications'],
    ]);

    expect(getZIndex('page')).toBe(0);
    expect(getZIndex('header')).toBe(1);
    expect(getZIndex('modals')).toBe(2);
    expect(getZIndex('notifications')).toBe(3);
    expect(getZIndex.zIndexDict).toEqual({
      page: 0,
      header: 1,
      modals: 2,
      notifications: 3,
    });
  });

  it('reserves space for layer sizes and indexes within a layer', () => {
    const getZIndex = compile(
      [
        ['page', 'header'],
        ['header', 'modals'],
        ['modals', 'notifications'],
      ],
      { modals: 3, notifications: 10 }
    );

    expect(getZIndex('page')).toBe(0);
    expect(getZIndex('header')).toBe(1);
    expect(getZIndex('modals')).toBe(2);
    expect(getZIndex('modals', 0)).toBe(2);
    expect(getZIndex('modals', 1)).toBe(3);
    expect(getZIndex('modals', 2)).toBe(4);
    expect(getZIndex('notifications')).toBe(5);
    expect(getZIndex('notifications', 9)).toBe(14);
  });

  it('respects predefined z-indices and null optional args', () => {
    const getZIndex = compile(
      [
        ['page', 'modal'],
        ['modal', 'notification'],
        ['notification', 'tooltips'],
      ],
      null,
      { modal: 1000 }
    );

    expect(getZIndex('page')).toBe(0);
    expect(getZIndex('modal')).toBe(1000);
    expect(getZIndex('notification')).toBe(1001);
    expect(getZIndex('tooltips')).toBe(1002);
  });

  it('picks the highest constraint when a layer has multiple lowers', () => {
    const getZIndex = compile(
      [
        ['a', 'c'],
        ['b', 'c'],
      ],
      { a: 1, b: 5 }
    );

    expect(getZIndex('a')).toBe(0);
    expect(getZIndex('b')).toBe(0);
    expect(getZIndex('c')).toBe(5);
  });

  it('keeps max when the first lower already dominates later lowers', () => {
    const getZIndex = compile(
      [
        ['b', 'c'],
        ['a', 'c'],
      ],
      { a: 1, b: 5 }
    );

    expect(getZIndex('c')).toBe(5);
  });

  it('throws RuleConflictError on a self-loop', () => {
    expect(() => compile([['a', 'a']])).toThrow(RuleConflictError);
    expect(() => compile([['a', 'a']])).toThrow('There is a loop in rules: a');
  });

  it('throws RuleConflictError on a multi-node cycle', () => {
    expect(() =>
      compile([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ])
    ).toThrow(RuleConflictError);

    try {
      compile([
        ['a', 'b'],
        ['b', 'a'],
      ]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RuleConflictError);
      expect((error as RuleConflictError<'a' | 'b'>).loop.sort()).toEqual([
        'a',
        'b',
      ]);
      expect((error as Error).message).toMatch(/There is a loop in rules:/);
    }
  });

  it('detects a cycle even when other acyclic layers exist', () => {
    // Singleton SCCs are recorded before the cyclic component; conflict still surfaces.
    expect(() =>
      compile([
        ['x', 'a'],
        ['b', 'c'],
        ['c', 'b'],
      ])
    ).toThrow(RuleConflictError);
  });

  it('throws AbsentLayerError for unknown layers', () => {
    const getZIndex = compile([['a', 'b']]);
    expect(() => getZIndex('missing' as 'a')).toThrow(AbsentLayerError);
    expect(() => getZIndex('missing' as 'a')).toThrow(
      'There is no layer with id: "missing"'
    );
  });

  it('throws LayerIndexOutOfBoundsError when index exceeds layer size', () => {
    const getZIndex = compile([['a', 'b']], { a: 2 });
    expect(() => getZIndex('a', 2)).toThrow(LayerIndexOutOfBoundsError);
    expect(() => getZIndex('a', 2)).toThrow(
      'Layer "a" cannot contain more than 2 items, but got 2'
    );
  });
});

describe('safeCompile', (it) => {
  it('returns ok provider for valid rules', () => {
    const result = safeCompile([['a', 'b']], undefined, undefined);
    expect(result.isOk).toBe(true);
    if (!result.isOk) return;

    expect(result.value.get('a', undefined)).toBe(0);
    expect(result.value.get('b', undefined)).toBe(1);
    expect(result.value.getLayersDict()).toEqual({ a: 0, b: 1 });
  });

  it('returns RuleConflictError without throwing', () => {
    const result = safeCompile([['x', 'x']]);
    expect(result.isOk).toBe(false);
    if (result.isOk) return;

    expect(result.error).toBeInstanceOf(RuleConflictError);
    expect(result.error.loop).toEqual(['x']);
  });

  it('treats missing layer sizes as 1 and keeps predefined zero', () => {
    const result = safeCompile([['a', 'b']], {}, { a: 0 });
    expect(result.isOk).toBe(true);
    if (!result.isOk) return;

    expect(result.value.get('a', undefined)).toBe(0);
    expect(result.value.get('b', undefined)).toBe(1);
  });
});

describe('ZIndexProvider', (it) => {
  it('getSafe covers success, absent, and out-of-bounds branches', () => {
    const provider = new ZIndexProvider(
      new Map([
        ['a', 10],
        ['b', 20],
      ]),
      new Map([['a' as 'a' | 'b', 2]])
    );

    expect(provider.getSafe('a', undefined)).toEqual({
      isOk: true,
      value: 10,
    });
    expect(provider.getSafe('a', 1)).toEqual({ isOk: true, value: 11 });

    const absent = provider.getSafe('missing' as 'a', 0);
    expect(absent.isOk).toBe(false);
    if (absent.isOk) return;
    expect(absent.error).toBeInstanceOf(AbsentLayerError);

    const oob = provider.getSafe('a', 2);
    expect(oob.isOk).toBe(false);
    if (oob.isOk) return;
    expect(oob.error).toBeInstanceOf(LayerIndexOutOfBoundsError);

    // missing size falls back to 1; index 0 is allowed, index 1 is not
    expect(provider.getSafe('b', 0)).toEqual({ isOk: true, value: 20 });
    const bOob = provider.getSafe('b', 1);
    expect(bOob.isOk).toBe(false);
  });

  it('get returns value or throws the underlying error', () => {
    const provider = new ZIndexProvider(
      new Map([['a', 3]]),
      new Map([['a', 1]])
    );
    expect(provider.get('a', undefined)).toBe(3);
    expect(() => provider.get('a', 1)).toThrow(LayerIndexOutOfBoundsError);
  });

  it('getLayersDict returns a null-prototype copy', () => {
    const source = { a: 1, b: 2 };
    const provider = new ZIndexProvider(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
      new Map([
        ['a', 1],
        ['b', 1],
      ])
    );
    const dict = provider.getLayersDict();

    expect(dict).toEqual(source);
    expect(Object.getPrototypeOf(dict)).toBeNull();
    dict.a = 99;
    expect(provider.get('a', 0)).toBe(1);
  });
});

describe('error classes', (it) => {
  it('formats AbsentLayerError and LayerIndexOutOfBoundsError messages', () => {
    expect(new AbsentLayerError('layer').message).toBe(
      'There is no layer with id: "layer"'
    );
    expect(new LayerIndexOutOfBoundsError('layer', 3, 5).message).toBe(
      'Layer "layer" cannot contain more than 3 items, but got 5'
    );
    expect(new RuleConflictError(['a', 'b', 'a']).message).toBe(
      'There is a loop in rules: a->b->a'
    );
  });
});

/**
 * Uncomment to check performance
 */
describe('compile performance', (it) => {
  it('compiles a large acyclic rule set within a tight budget', () => {
    const layerCount = 10000;
    const rules: [string, string][] = [];
    for (let i = 0; i < layerCount - 1; i++) {
      rules.push([`l${i}`, `l${i + 1}`]);
    }
    for (let i = 0; i < layerCount - 10; i += 3) {
      rules.push([`l${i}`, `l${i + 5}`]);
    }

    compile(rules); // warmup

    const startedAt = performance.now();
    const getZIndex = compile(rules);
    const elapsedMs = performance.now() - startedAt;

    expect(getZIndex(`l${layerCount - 1}`)).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(0);
  });
});
