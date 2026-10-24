import React, { useEffect, useRef } from "react";
import { AlertCircle, Square, X } from "lucide-react";

interface Props {
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EndSessionModal({
  taskName,
  onConfirm,
  onCancel,
}: Props): JSX.Element {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Focus Cancel button on mount for safe keyboard navigation
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay fade-in"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-modal-title"
        aria-describedby="end-session-modal-desc"
      >
        <div className="modal__header">
          <div className="modal__header-icon modal__header-icon--warning">
            <AlertCircle size={20} color="var(--color-drifting)" />
          </div>
          <h2 id="end-session-modal-title" className="modal__title">
            End Focus Session?
          </h2>
          <button
            className="modal__close"
            onClick={onCancel}
            aria-label="Close dialog without ending session"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal__body">
          <p id="end-session-modal-desc" className="modal__text">
            Are you ready to wrap up your focus block for{" "}
            <strong>&ldquo;{taskName}&rdquo;</strong>?
          </p>
          <p className="modal__subtext">
            Your active elapsed focus time and session statistics will be recorded and summarized.
          </p>
        </div>

        <div className="modal__footer">
          <button
            ref={cancelBtnRef}
            id="btn-cancel-end-session"
            className="btn btn-secondary"
            onClick={onCancel}
            aria-label="Keep working, do not end session"
          >
            Keep Working
          </button>
          <button
            id="btn-confirm-end-session"
            className="btn btn-danger"
            onClick={onConfirm}
            aria-label="Confirm and end current session"
          >
            <Square size={14} />
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}
