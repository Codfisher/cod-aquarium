import type { UnionToIntersection } from 'type-fest'

type OverloadToUnion<T> =
  T extends {
    (...a: infer A1): infer R1;
    (...a: infer A2): infer R2;
    (...a: infer A3): infer R3;
    (...a: infer A4): infer R4;
    (...a: infer A5): infer R5;
    (...a: infer A6): infer R6;
    (...a: infer A7): infer R7;
    (...a: infer A8): infer R8;
    (...a: infer A9): infer R9;
    (...a: infer A10): infer R10;
    (...a: infer A11): infer R11;
    (...a: infer A12): infer R12;
    (...a: infer A13): infer R13;
    (...a: infer A14): infer R14;
    (...a: infer A15): infer R15;
    (...a: infer A16): infer R16;
    (...a: infer A17): infer R17;
    (...a: infer A18): infer R18;
    (...a: infer A19): infer R19;
    (...a: infer A20): infer R20;
    (...a: infer A21): infer R21;
    (...a: infer A22): infer R22;
    (...a: infer A23): infer R23;
    (...a: infer A24): infer R24;
    (...a: infer A25): infer R25;
    (...a: infer A26): infer R26;
    (...a: infer A27): infer R27;
    (...a: infer A28): infer R28;
    (...a: infer A29): infer R29;
    (...a: infer A30): infer R30;
    (...a: infer A31): infer R31;
    (...a: infer A32): infer R32;
  }
    ? ((...a: A1) => R1) | ((...a: A2) => R2) | ((...a: A3) => R3) | ((...a: A4) => R4)
    | ((...a: A5) => R5) | ((...a: A6) => R6) | ((...a: A7) => R7) | ((...a: A8) => R8)
    | ((...a: A9) => R9) | ((...a: A10) => R10) | ((...a: A11) => R11) | ((...a: A12) => R12)
    | ((...a: A13) => R13) | ((...a: A14) => R14) | ((...a: A15) => R15) | ((...a: A16) => R16)
    | ((...a: A17) => R17) | ((...a: A18) => R18) | ((...a: A19) => R19) | ((...a: A20) => R20)
    | ((...a: A21) => R21) | ((...a: A22) => R22) | ((...a: A23) => R23) | ((...a: A24) => R24)
    | ((...a: A25) => R25) | ((...a: A26) => R26) | ((...a: A27) => R27) | ((...a: A28) => R28)
    | ((...a: A29) => R29) | ((...a: A30) => R30) | ((...a: A31) => R31) | ((...a: A32) => R32)
    : T extends (...a: infer A) => infer R
      ? (...a: A) => R
      : never

type EmitSigToObj<S> =
  S extends (event: infer K, ...args: infer A) => any
    ? K extends PropertyKey
      ? { [P in K]: (...args: A) => void }
      : never
    : never

export type EmitsToObject<E> = UnionToIntersection<
  OverloadToUnion<E> extends infer S
    ? S extends any
      ? EmitSigToObj<S>
      : never
    : never
>
