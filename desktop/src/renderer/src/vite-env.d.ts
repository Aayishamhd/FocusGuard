/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_ENGINE_BASE_URL?: string;
  readonly VITE_ASSISTANT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
