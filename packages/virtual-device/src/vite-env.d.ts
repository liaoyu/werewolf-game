/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LINX_DEVICE_MAC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
