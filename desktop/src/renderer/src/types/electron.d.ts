/**
 * Global type declaration for the Electron preload API.
 * This makes window.focusGuard typed in renderer TypeScript.
 */

import type { FocusGuardAPI } from "../../preload/index";

declare global {
  interface Window {
    focusGuard?: FocusGuardAPI;
  }
}

export {};
