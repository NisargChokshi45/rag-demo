// Client-side registry for work that outlives the page that started it. A
// request keeps running after client-side navigation unmounts its page, so the
// page reads in-flight state from here rather than from its own local state.
export interface PendingStore<Value> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ReadonlyMap<string, Value>;
  set: (id: string, value: Value) => void;
  remove: (id: string) => void;
}

export function createPendingStore<Value>(): PendingStore<Value> {
  let snapshot: ReadonlyMap<string, Value> = new Map();
  const listeners = new Set<() => void>();

  const commit = (next: Map<string, Value>) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    set(id, value) {
      commit(new Map(snapshot).set(id, value));
    },
    remove(id) {
      if (!snapshot.has(id)) return;
      const next = new Map(snapshot);
      next.delete(id);
      commit(next);
    },
  };
}

// Document id to chunks still left to embed (null until the first report).
export const reparsingDocuments = createPendingStore<number | null>();
// Document id to chunks still left to embed while resuming a paused document.
export const resumingDocuments = createPendingStore<number | null>();
// Candidate id to nothing; presence alone means a rescore is in flight.
export const rescoringCandidates = createPendingStore<null>();
