declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare global {
  interface ImportMetaEnv {
    readonly EXTENSION_PUBLIC_BROWSER?: string;
    readonly EXTENSION_PUBLIC_BUNDLER_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface BrowserActionApi {
    onClicked: {
      addListener: (callback: () => void) => void;
    };
  }

  interface SidebarActionApi {
    open: () => void;
  }

  interface BrowserRuntimeApi {
    onMessage: {
      addListener: (callback: (message: { type?: string }) => void) => void;
    };
    sendMessage: (message: unknown) => void;
  }

  interface BrowserLikeApi {
    browserAction: BrowserActionApi;
    sidebarAction: SidebarActionApi;
    runtime: BrowserRuntimeApi;
  }

  const browser: BrowserLikeApi;

  interface EthereumRequestArgs {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }

  interface EthereumProvider {
    isMetaMask?: boolean;
    isCoinbaseWallet?: boolean;
    request: <T = unknown>(args: EthereumRequestArgs) => Promise<T>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  }

  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
