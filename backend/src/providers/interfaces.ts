// Shared shape for "go talk to an external source and bring back its raw
// items" — deliberately just a method signature, not a shared data contract.
// Different sources (RSS, Telegram, ...) return structurally different item
// types; forcing them into one shape would either lose source-specific data
// or invent a fake lowest-common-denominator nobody needs yet.
export interface IProvider<TItem> {
    fetch(source: string): Promise<TItem[]>;
}
