// The few extension APIs this code uses, typed by hand so there's no extra dependency. Chrome
// calls it `chrome`, Firefox `browser`; `src/ext.ts` picks one. Both return promises in MV3.

interface ExtStorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ExtMessageSender {
  tab?: { id?: number; url?: string };
  id?: string;
}

interface ExtApi {
  runtime: {
    id: string;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        cb: (message: unknown, sender: ExtMessageSender, reply: (answer: unknown) => void) => boolean | void,
      ): void;
    };
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
  };
  tabs: {
    /** With `activeTab`, the current tab's `url` is visible once the user opened the popup. */
    query(info: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>;
  };
  storage: {
    sync: ExtStorageArea;
    local: ExtStorageArea;
    onChanged: { addListener(cb: (changes: Record<string, ExtStorageChange>, area: string) => void): void };
  };
}

declare const chrome: ExtApi | undefined;
declare const browser: ExtApi | undefined;
