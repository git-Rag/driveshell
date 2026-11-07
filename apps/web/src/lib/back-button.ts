import { App as CapApp } from '@capacitor/app';
import { isCapacitor } from './api';

type BackHandler = () => boolean; // return true if handled, false to delegate

const handlers: BackHandler[] = [];
let initialized = false;

/**
 * Register a back button handler. Handlers are evaluated in LIFO order
 * (the most recently registered handler executes first).
 * Returns an unregister cleanup function.
 */
export function registerBackButtonHandler(fn: BackHandler): () => void {
  handlers.push(fn);
  return () => {
    const idx = handlers.indexOf(fn);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * Initialize system back button listener for Android.
 * Intercepts back navigation to close open modals, overlays, or return to home gallery.
 */
export function initBackButtonListener(fallbackAction?: () => void): void {
  if (initialized || typeof window === 'undefined' || !isCapacitor()) return;
  initialized = true;

  void CapApp.addListener('backButton', () => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      const handler = handlers[i];
      if (handler && handler()) {
        return;
      }
    }

    if (fallbackAction) {
      fallbackAction();
    } else {
      void CapApp.exitApp();
    }
  });
}
