import React, { useState, useEffect } from "react";
import { Minus, Square, Copy, X } from "lucide-react";

export function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial window state if supported
    if (typeof window !== "undefined" && window.focusGuard?.isWindowMaximized) {
      window.focusGuard
        .isWindowMaximized()
        .then(setIsMaximized)
        .catch(() => {});
    }

    // Subscribe to maximize/restore state changes from main process
    if (typeof window !== "undefined" && window.focusGuard?.onWindowMaximizedChange) {
      const unsubscribe = window.focusGuard.onWindowMaximizedChange((maximized: boolean) => {
        setIsMaximized(maximized);
      });
      return unsubscribe;
    }
  }, []);

  const handleMinimize = () => {
    if (typeof window !== "undefined" && window.focusGuard?.minimizeWindow) {
      window.focusGuard.minimizeWindow().catch(() => {});
    }
  };

  const handleMaximizeToggle = async () => {
    if (typeof window !== "undefined" && window.focusGuard?.toggleMaximizeWindow) {
      try {
        const nextState = await window.focusGuard.toggleMaximizeWindow();
        setIsMaximized(nextState);
      } catch {
        // ignore
      }
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.focusGuard?.closeWindow) {
      window.focusGuard.closeWindow().catch(() => {});
    }
  };

  return (
    <header className="titlebar" aria-label="FocusGuard Title Bar">
      <div className="titlebar__drag-region">
        <div className="titlebar__brand">
          <div className="titlebar__logo-dot" />
          <span className="titlebar__title">FocusGuard</span>
          <span className="titlebar__tagline">Attention Companion</span>
        </div>
      </div>

      <div className="titlebar__controls" aria-label="Window Controls">
        <button
          id="btn-window-minimize"
          className="titlebar__btn titlebar__btn--minimize"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize Window"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <button
          id="btn-window-maximize"
          className="titlebar__btn titlebar__btn--maximize"
          onClick={handleMaximizeToggle}
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore Window" : "Maximize Window"}
        >
          {isMaximized ? (
            <Copy size={12} strokeWidth={1.8} style={{ transform: "rotate(90deg)" }} />
          ) : (
            <Square size={12} strokeWidth={1.8} />
          )}
        </button>

        <button
          id="btn-window-close"
          className="titlebar__btn titlebar__btn--close"
          onClick={handleClose}
          title="Close"
          aria-label="Close Window"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
