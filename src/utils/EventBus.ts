/**
 * A tiny typed publish/subscribe bus.
 *
 * Systems talk to each other through events rather than holding references to
 * one another: the audio manager does not need to know the HUD exists, and the
 * HUD does not need a handle on the player. The event map is declared per bus,
 * so payloads stay type-checked at both ends.
 */
export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

export class EventBus<M extends EventMap> {
  private readonly handlers = new Map<keyof M, Set<Handler<never>>>();

  /** Subscribes to `event`. Returns a function that unsubscribes. */
  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  /** Subscribes for a single delivery. */
  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  /**
   * Delivers `payload` to every current subscriber.
   *
   * Handlers are copied before iterating so a handler may unsubscribe itself,
   * and a throwing handler cannot prevent the rest from running.
   */
  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<M[K]>)(payload);
      } catch (error) {
        console.error(`[EventBus] handler for "${String(event)}" threw`, error);
      }
    }
  }

  /** Drops every subscriber, or only those for `event` when given. */
  clear<K extends keyof M>(event?: K): void {
    if (event === undefined) this.handlers.clear();
    else this.handlers.delete(event);
  }

  listenerCount<K extends keyof M>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
