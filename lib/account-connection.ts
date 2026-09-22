// Application-owned choices; the server maps them to provider products.
export const ACCOUNT_CONNECTION_KINDS = ["banking", "investments", "loans"] as const;
export type AccountConnectionKind = (typeof ACCOUNT_CONNECTION_KINDS)[number];

export function isAccountConnectionKind(value: unknown): value is AccountConnectionKind {
  return typeof value === "string" && ACCOUNT_CONNECTION_KINDS.some((kind) => kind === value);
}
