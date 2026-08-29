import { describe, expect, it } from "vitest";
import {
  CanonicalJsonError,
  CanonicalJsonValidationError,
  canonicalJson,
  canonicalJsonClone,
  canonicalJsonV2,
  canonicalSha256,
  sha256CanonicalJsonV2,
  utf8Sha256,
} from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";

function expectContractError(makeValue: () => unknown): void {
  let thrown: unknown;
  try {
    canonicalJson(makeValue());
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CanonicalJsonError);
  expect(thrown).toBeInstanceOf(CanonicalJsonValidationError);
  expect(thrown).toMatchObject({
    name: "CanonicalJsonValidationError",
    code: "INVALID_CANONICAL_JSON_VALUE",
  });
}

describe("Task 1 shared canonical JSON contract", () => {
  it("keeps the M1 and M2 serializer and digest names byte-identical", () => {
    const value = {
      z: [null, true, 1, "文本"],
      a: { nested: "value" },
    };
    expect(canonicalJsonV2(value)).toBe(canonicalJson(value));
    expect(sha256CanonicalJsonV2(value)).toBe(canonicalSha256(value));
    expect(utf8Sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("accepts shared acyclic references while preserving deterministic key order", () => {
    const shared = { value: 1 };
    expect(canonicalJson({ z: shared, a: shared })).toBe(
      '{"a":{"value":1},"z":{"value":1}}',
    );
    expect(canonicalJson({ "2": "two", "10": "ten" })).toBe(
      '{"10":"ten","2":"two"}',
    );
  });

  it("rejects every lossy or executable runtime shape with one typed error", () => {
    const nonEnumerableArray = [1];
    Object.defineProperty(nonEnumerableArray, "0", {
      enumerable: false,
      configurable: true,
      writable: true,
      value: 1,
    });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let proxyTrapCalls = 0;
    const proxyHandler: ProxyHandler<object> = {
      getPrototypeOf: (target) => {
        proxyTrapCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys: (target) => {
        proxyTrapCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, key) => {
        proxyTrapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    };
    const proxiedRecord = new Proxy({ value: 1 }, proxyHandler);
    const proxiedArray = new Proxy([1], proxyHandler);
    let accessorCalls = 0;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        return 1;
      },
    });

    const invalidValues: Array<() => unknown> = [
      () => Array(1),
      () => Object.assign([1], { extra: true }),
      () => Object.setPrototypeOf([1], null),
      () => nonEnumerableArray,
      () => proxiedRecord,
      () => proxiedArray,
      () => new Date(0),
      () => new Map([["key", "value"]]),
      () => new Set(["value"]),
      () => new (class RuntimeRecord { readonly value = 1; })(),
      () => accessor,
      () => ({ [Symbol("value")]: 1 }),
      () => undefined,
      () => () => true,
      () => Symbol("value"),
      () => 1n,
      () => Number.NaN,
      () => Number.POSITIVE_INFINITY,
      () => -0,
      () => cyclic,
    ];
    for (const makeValue of invalidValues) expectContractError(makeValue);
    expect(proxyTrapCalls).toBe(0);
    expect(accessorCalls).toBe(0);
  });

  it("returns a detached, deeply frozen, null-prototype clone with safe reserved keys", () => {
    const input = JSON.parse(
      '{"__proto__":{"value":1},"constructor":{"value":2},"prototype":[3]}',
    ) as Record<string, unknown>;
    const clone = canonicalJsonClone(input) as Record<string, unknown>;

    expect(Object.getPrototypeOf(clone)).toBeNull();
    expect(Object.isFrozen(clone)).toBe(true);
    expect(Object.isFrozen(clone.__proto__)).toBe(true);
    expect(Object.isFrozen(clone.constructor)).toBe(true);
    expect(Object.isFrozen(clone.prototype)).toBe(true);
    expect(clone).not.toBe(input);
    expect(canonicalJson(clone)).toBe(
      '{"__proto__":{"value":1},"constructor":{"value":2},"prototype":[3]}',
    );
  });
});
