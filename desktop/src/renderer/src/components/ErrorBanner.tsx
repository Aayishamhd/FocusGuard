import React from "react";
import { AlertCircle, X } from "lucide-react";

interface Props {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: Props): JSX.Element {
  return (
    <div className="error-banner fade-in" role="alert">
      <AlertCircle size={15} />
      <span>{message}</span>
      <button className="btn btn-ghost btn-sm" onClick={onDismiss} aria-label="Dismiss error">
        <X size={14} />
      </button>
    </div>
  );
}
