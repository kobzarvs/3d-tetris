export type Atom<T> = {
  (): T;
  set(value: T | ((prev: T) => T)): void;
  actions<A extends Record<string, any>>(fn: (atom: Atom<T>) => A): Atom<T> & A;
};

function getAlpine() {
  if (typeof window !== 'undefined' && (window as any).Alpine) {
    return (window as any).Alpine;
  }
  // Minimal stub for non-browser environments (e.g. tests)
  return {
    reactive: <T>(obj: T) => obj,
    effect: (_fn: () => void) => {
      /* noop */
    }
  };
}

export function atom<T>(initial: T): Atom<T> {
  const Alpine: any = getAlpine();
  const data = Alpine.reactive({ value: initial });
  const fn = (() => data.value) as Atom<T>;
  fn.set = (v: any) => {
    data.value = typeof v === 'function' ? v(data.value) : v;
  };
  fn.actions = (fnActions: any) => {
    const actions = fnActions(fn);
    Object.assign(fn, actions);
    return fn as any;
  };
  return fn;
}

export function computed<T>(cb: () => T): () => T {
  return () => cb();
}

export function effect(cb: () => void) {
  const Alpine: any = getAlpine();
  Alpine.effect(cb);
}
