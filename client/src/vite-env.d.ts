/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_CARTO_API_KEY: string;
  readonly CARTO_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
