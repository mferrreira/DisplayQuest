/**
 * entities/ — single type source mirroring backend contracts (constitution §1, §4).
 * Every schema cites its Prisma model or route source. Response ENVELOPES ({tasks}, {data}, bare)
 * live in lib/api/* (T0.5) — these files own the ENTITY shapes.
 */
export * from "./user";
export * from "./task";
export * from "./project";
export * from "./work-session";
export * from "./reward";
export * from "./report";
export * from "./lab";
export * from "./issue";
export * from "./badge";
export * from "./notification";
