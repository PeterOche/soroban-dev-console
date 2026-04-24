import { describe, it, expect } from 'vitest';
import {
  STORE_SCHEMA_VERSION,
  SERIALIZER_VERSION,
  API_SNAPSHOT_VERSION,
  SUPPORTED_LEGACY_VERSIONS,
  assertSupportedVersion,
} from './schema-version';

describe('Schema Version', () => {
  it('should have consistent version numbers', () => {
    expect(STORE_SCHEMA_VERSION).toBe(2);
    expect(SERIALIZER_VERSION).toBe(2);
    expect(API_SNAPSHOT_VERSION).toBe(2);
  });

  it('should define supported legacy versions', () => {
    expect(SUPPORTED_LEGACY_VERSIONS).toContain(1);
  });

  describe('assertSupportedVersion', () => {
    it('should not throw for current version', () => {
      expect(() => assertSupportedVersion(2, 'test')).not.toThrow();
    });

    it('should not throw for legacy versions (migration path)', () => {
      expect(() => assertSupportedVersion(1, 'test')).not.toThrow();
    });

    it('should throw for unsupported versions', () => {
      expect(() => assertSupportedVersion(99, 'test')).toThrow(
        '[test] Unsupported schema version: 99',
      );
    });

    it('should throw for invalid version types', () => {
      expect(() => assertSupportedVersion('invalid', 'test')).toThrow();
    });
  });
});
