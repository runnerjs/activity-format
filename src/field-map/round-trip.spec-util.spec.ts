import {
  assertArrayStructureEqual,
  assertDeepEqualWithTolerance,
  assertLeafPathsEqual,
  collectLeafPaths,
} from './round-trip.spec-util';

describe('round-trip.spec-util', () => {
  describe('collectLeafPaths', () => {
    it('归一化数组下标为 []', () => {
      const paths = collectLeafPaths({
        records: [{ hr: 90 }, { hr: 92 }],
        meta: { version: 1 },
      });
      expect(paths).toEqual(new Set(['records[].hr', 'meta.version']));
    });

    it('保留 null 叶子路径', () => {
      const paths = collectLeafPaths({ a: null });
      expect(paths).toEqual(new Set(['a']));
    });
  });

  describe('assertLeafPathsEqual', () => {
    it('路径全集相等时通过', () => {
      const raw = { a: 1, b: [{ c: 2 }] };
      const merged = { a: 1, b: [{ c: 2 }] };
      expect(() => assertLeafPathsEqual(merged, raw)).not.toThrow();
    });

    it('路径缺失时失败', () => {
      const raw = { a: 1, b: 2 };
      const merged = { a: 1 };
      expect(() => assertLeafPathsEqual(merged, raw)).toThrow();
    });
  });

  describe('assertArrayStructureEqual', () => {
    it('逐元素 key 集合一致', () => {
      const raw = [{ hr: 90, lat: 1 }, { hr: 92 }];
      const merged = [{ lat: 1, hr: 90 }, { hr: 92 }];
      assertArrayStructureEqual(merged, raw, 'records');
    });
  });

  describe('assertDeepEqualWithTolerance', () => {
    it('坐标容差内视为相等', () => {
      assertDeepEqualWithTolerance(
        { lat: 22.66090337187052 },
        { lat: 22.660903371870518 },
        () => 'coordinateDeg',
      );
    });

    it('extensions 数值精确相等', () => {
      assertDeepEqualWithTolerance(
        { enhancedSpeed: 2.088 },
        { enhancedSpeed: 2.088 },
      );
    });
  });
});
