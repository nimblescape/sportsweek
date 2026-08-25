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

type Filter = { field: string; value: unknown };

export class FakeQuery {
  constructor(
    protected readonly firestore: FakeFirestore,
    protected readonly collectionPath: string,
    protected readonly filters: Filter[] = [],
    protected readonly limitCount: number | null = null,
  ) {}

  where(field: string, operator: string, value: unknown): FakeQuery {
    if (operator !== "==") {
      throw new Error(`FakeFirestore only supports "==" queries, got "${operator}"`);
    }
    return new FakeQuery(
      this.firestore,
      this.collectionPath,
      [...this.filters, { field, value }],
      this.limitCount,
    );
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionPath, this.filters, count);
  }

  async get(): Promise<FakeQuerySnapshot> {
    return this.firestore.runQuery(this.collectionPath, this.filters, this.limitCount);
  }
}

export class FakeCollectionReference extends FakeQuery {
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

  /** Runs before each transaction attempt, letting a test simulate a concurrent write. */
  onTransactionAttempt: ((attempt: number) => void) | null = null;
  transactionCount = 0;

  collection(path: string): FakeCollectionReference {
    return new FakeCollectionReference(this, path);
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
    const matches = [...this.collectionMap(collectionPath).entries()]
      .filter(([, data]) => filters.every((filter) => data[filter.field] === filter.value))
      .map(
        ([id, data]) =>
          new FakeDocumentSnapshot(id, data, new FakeDocumentReference(this, collectionPath, id)),
      );

    return new FakeQuerySnapshot(limitCount === null ? matches : matches.slice(0, limitCount));
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
    this.transactionCount = 0;
    this.onTransactionAttempt = null;
  }
}
