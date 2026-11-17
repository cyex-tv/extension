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
    getManifest(): { version: string };
    openOptionsPage(): Promise<void>;
    onInstalled: { addListener(cb: (details: { reason: string; previousVersion?: string }) => void): void };
  };
  tabs: {
    /** With `activeTab`, the current tab's `url` is visible once the user opened the popup. */
    query(info: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>;
    /** Needs no permission for the extension's own pages. */
    create(props: { url: string }): Promise<unknown>;
    /** To the content scripts in a tab; needs no permission. */
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  commands: { onCommand: { addListener(cb: (command: string) => void): void } };
  storage: {
    sync: ExtStorageArea;
    local: ExtStorageArea;
    onChanged: { addListener(cb: (changes: Record<string, ExtStorageChange>, area: string) => void): void };
  };
}

declare const chrome: ExtApi | undefined;
declare const browser: ExtApi | undefined;
