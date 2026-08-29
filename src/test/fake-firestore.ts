/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * A tiny in-memory stand-in for the Admin SDK Firestore surface this app uses.
 *
 * It exists so service-level tests can assert real behaviour — transactional flips,
 * batch chunking, cascade deletes — instead of asserting that a mock was called.
 * Only the operators the app actually issues are supported; anything else throws
 * loudly rather than silently returning wrong data.
 */

export type DocumentData = Record<string, unknown>;

const MAX_WRITES_PER_BATCH = 500;

type Store = Map<string, Map<string, DocumentData>>;

function cloneData(data: DocumentData): DocumentData {
  return structuredClone(data);
}

export class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly stored: DocumentData | undefined,
    readonly ref: FakeDocumentReference,
  ) {}

  get exists(): boolean {
    return this.stored !== undefined;
  }

  data(): DocumentData | undefined {
    return this.stored ? cloneData(this.stored) : undefined;
  }
}

export class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: FakeDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

export class FakeDocumentReference {
  constructor(
    readonly firestore: FakeFirestore,
    readonly collectionPath: string,
    readonly id: string,
  ) {}

  get path(): string {
    return `${this.collectionPath}/${this.id}`;
  }

  get parent(): FakeCollectionReference {
    return new FakeCollectionReference(this.firestore, this.collectionPath);
  }

  async get(): Promise<FakeDocumentSnapshot> {
    return this.firestore.readDoc(this.collectionPath, this.id);
  }

  async set(data: DocumentData): Promise<void> {
    this.firestore.writeDoc(this.collectionPath, this.id, data);
  }

  async update(data: DocumentData): Promise<void> {
    this.firestore.mergeDoc(this.collectionPath, this.id, data);
  }

  async delete(): Promise<void> {
    this.firestore.deleteDoc(this.collectionPath, this.id);
  }
}

type Filter = { field: string; operator: "==" | "array-contains"; value: unknown };

export class FakeAggregateSnapshot {
  constructor(private readonly matches: number) {}

  data(): { count: number } {
    return { count: this.matches };
  }
}

export class FakeQuery {
  constructor(
    protected readonly firestore: FakeFirestore,
    /** A collection path, or the last segment alone while `group` is set. */
    protected readonly collectionPath: string,
    protected readonly filters: Filter[] = [],
    protected readonly limitCount: number | null = null,
    /** Matches every collection whose last path segment is `collectionPath`, at any depth. */
    protected readonly group = false,
  ) {}

  where(field: string, operator: string, value: unknown): FakeQuery {
    if (operator !== "==" && operator !== "array-contains") {
      throw new Error(
        `FakeFirestore supports "==" and "array-contains" queries, got "${operator}"`,
      );
    }
    return new FakeQuery(
      this.firestore,
      this.collectionPath,
      [...this.filters, { field, operator, value }],
      this.limitCount,
      this.group,
    );
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionPath, this.filters, count, this.group);
  }

  /** Aggregates server-side, so the documents themselves never cross the wire. */
  count(): { get(): Promise<FakeAggregateSnapshot> } {
    return {
      get: async () =>
        new FakeAggregateSnapshot(this.firestore.runCount(this.collectionPath, this.filters)),
    };
  }

  async get(): Promise<FakeQuerySnapshot> {
    return this.group
      ? this.firestore.runGroupQuery(this.collectionPath, this.filters, this.limitCount)
      : this.firestore.runQuery(this.collectionPath, this.filters, this.limitCount);
  }
}

export class FakeCollectionReference extends FakeQuery {
  /** Null for a top-level collection, the owning document for a subcollection. */
  get parent(): FakeDocumentReference | null {
    const segments = this.collectionPath.split("/");
    if (segments.length < 3) return null;

    return new FakeDocumentReference(
      this.firestore,
      segments.slice(0, -2).join("/"),
      segments[segments.length - 2],
    );
  }

  doc(id?: string): FakeDocumentReference {
    return new FakeDocumentReference(
      this.firestore,
      this.collectionPath,
      id ?? this.firestore.nextId(),
    );
  }

  async add(data: DocumentData): Promise<FakeDocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

type PendingWrite =
  | { kind: "set"; ref: FakeDocumentReference; data: DocumentData }
  | { kind: "update"; ref: FakeDocumentReference; data: DocumentData }
  | { kind: "delete"; ref: FakeDocumentReference };

export class FakeWriteBatch {
  private readonly writes: PendingWrite[] = [];
  private committed = false;

  constructor(private readonly firestore: FakeFirestore) {}

  set(ref: FakeDocumentReference, data: DocumentData): this {
    this.writes.push({ kind: "set", ref, data });
    return this;
  }

  update(ref: FakeDocumentReference, data: DocumentData): this {
    this.writes.push({ kind: "update", ref, data });
    return this;
  }

  delete(ref: FakeDocumentReference): this {
    this.writes.push({ kind: "delete", ref });
    return this;
  }

  async commit(): Promise<void> {
    if (this.committed) throw new Error("A write batch cannot be committed twice");
    if (this.writes.length > MAX_WRITES_PER_BATCH) {
      throw new Error(
        `A write batch takes at most ${MAX_WRITES_PER_BATCH} operations, got ${this.writes.length}`,
      );
    }
    this.committed = true;
    this.firestore.commitCount += 1;
    this.firestore.batchSizes.push(this.writes.length);
    for (const write of this.writes) this.firestore.applyWrite(write);
  }
}

export class FakeTransaction {
  private readonly writes: PendingWrite[] = [];

  constructor(private readonly firestore: FakeFirestore) {}

  async get(target: FakeDocumentReference): Promise<FakeDocumentSnapshot>;
  async get(target: FakeQuery): Promise<FakeQuerySnapshot>;
  async get(
    target: FakeDocumentReference | FakeQuery,
  ): Promise<FakeDocumentSnapshot | FakeQuerySnapshot> {
    if (this.writes.length > 0) {
      throw new Error("Firestore transactions require every read before the first write");
    }
    return target.get();
  }

  set(ref: FakeDocumentReference, data: DocumentData): this {
    this.writes.push({ kind: "set", ref, data });
    return this;
  }

  update(ref: FakeDocumentReference, data: DocumentData): this {
    this.writes.push({ kind: "update", ref, data });
    return this;
  }

  delete(ref: FakeDocumentReference): this {
    this.writes.push({ kind: "delete", ref });
    return this;
  }

  flush(): void {
    for (const write of this.writes) this.firestore.applyWrite(write);
  }
}

export class FakeFirestore {
  private readonly store: Store = new Map();
  private idCounter = 0;

  /** Test-visible counters, so batching behaviour can be asserted directly. */
  commitCount = 0;
  batchSizes: number[] = [];

  /** Documents a query actually handed back, so a test can prove a read is not O(collection). */
  queryDocumentsRead = 0;

  /** Runs before each transaction attempt, letting a test simulate a concurrent write. */
  onTransactionAttempt: ((attempt: number) => void) | null = null;
  transactionCount = 0;

  collection(path: string): FakeCollectionReference {
    return new FakeCollectionReference(this, path);
  }

  /** Every collection with this name, wherever it sits — subcollections included. */
  collectionGroup(collectionId: string): FakeQuery {
    return new FakeQuery(this, collectionId, [], null, true);
  }

  batch(): FakeWriteBatch {
    return new FakeWriteBatch(this);
  }

  async runTransaction<T>(handler: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.onTransactionAttempt?.(this.transactionCount);

    const transaction = new FakeTransaction(this);
    const result = await handler(transaction);
    transaction.flush();
    return result;
  }

  nextId(): string {
    this.idCounter += 1;
    return `generated-${this.idCounter}`;
  }

  private collectionMap(path: string): Map<string, DocumentData> {
    let existing = this.store.get(path);
    if (!existing) {
      existing = new Map();
      this.store.set(path, existing);
    }
    return existing;
  }

  readDoc(collectionPath: string, id: string): FakeDocumentSnapshot {
    const stored = this.collectionMap(collectionPath).get(id);
    return new FakeDocumentSnapshot(
      id,
      stored,
      new FakeDocumentReference(this, collectionPath, id),
    );
  }

  writeDoc(collectionPath: string, id: string, data: DocumentData): void {
    this.collectionMap(collectionPath).set(id, cloneData(data));
  }

  mergeDoc(collectionPath: string, id: string, data: DocumentData): void {
    const collection = this.collectionMap(collectionPath);
    const existing = collection.get(id);
    if (!existing) throw new Error(`No document to update at ${collectionPath}/${id}`);
    collection.set(id, { ...existing, ...cloneData(data) });
  }

  deleteDoc(collectionPath: string, id: string): void {
    this.collectionMap(collectionPath).delete(id);
  }

  applyWrite(write: PendingWrite): void {
    if (write.kind === "set") this.writeDoc(write.ref.collectionPath, write.ref.id, write.data);
    else if (write.kind === "update")
      this.mergeDoc(write.ref.collectionPath, write.ref.id, write.data);
    else this.deleteDoc(write.ref.collectionPath, write.ref.id);
  }

  runQuery(
    collectionPath: string,
    filters: Filter[],
    limitCount: number | null,
  ): FakeQuerySnapshot {
    const matches = this.matching(collectionPath, filters).map(
      ([id, data]) =>
        new FakeDocumentSnapshot(id, data, new FakeDocumentReference(this, collectionPath, id)),
    );

    return this.take(matches, limitCount);
  }

  runGroupQuery(
    collectionId: string,
    filters: Filter[],
    limitCount: number | null,
  ): FakeQuerySnapshot {
    const matches = [...this.store.keys()]
      .filter((path) => path.split("/").at(-1) === collectionId)
      .flatMap((path) =>
        this.matching(path, filters).map(
          ([id, data]) =>
            new FakeDocumentSnapshot(id, data, new FakeDocumentReference(this, path, id)),
        ),
      );

    return this.take(matches, limitCount);
  }

  private take(matches: FakeDocumentSnapshot[], limitCount: number | null): FakeQuerySnapshot {
    const returned = limitCount === null ? matches : matches.slice(0, limitCount);
    this.queryDocumentsRead += returned.length;
    return new FakeQuerySnapshot(returned);
  }

  runCount(collectionPath: string, filters: Filter[]): number {
    return this.matching(collectionPath, filters).length;
  }

  private matching(collectionPath: string, filters: Filter[]): [string, DocumentData][] {
    return [...this.collectionMap(collectionPath).entries()].filter(([, data]) =>
      filters.every((filter) => {
        const stored = data[filter.field];
        return filter.operator === "array-contains"
          ? Array.isArray(stored) && stored.includes(filter.value)
          : stored === filter.value;
      }),
    );
  }

  seed(collectionPath: string, id: string, data: DocumentData): void {
    this.writeDoc(collectionPath, id, data);
  }

  docs(collectionPath: string): Record<string, DocumentData> {
    return Object.fromEntries(this.collectionMap(collectionPath));
  }

  get(collectionPath: string, id: string): DocumentData | undefined {
    return this.collectionMap(collectionPath).get(id);
  }

  count(collectionPath: string): number {
    return this.collectionMap(collectionPath).size;
  }

  reset(): void {
    this.store.clear();
    this.idCounter = 0;
    this.commitCount = 0;
    this.batchSizes = [];
    this.queryDocumentsRead = 0;
    this.transactionCount = 0;
    this.onTransactionAttempt = null;
  }
}
