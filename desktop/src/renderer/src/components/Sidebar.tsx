import React from "react";
import { LayoutDashboard, BarChart3, Settings, Shield } from "lucide-react";
import type { ActivePage } from "../types/app";
import { useAppStore } from "../store/appStore";
import { isUsingMocks } from "../services/serviceManager";

interface NavItem {
  id: ActivePage;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
  { id: "settings",  label: "Settings",  icon: <Settings size={18} /> },
];

export function Sidebar(): JSX.Element {
  const { state, setPage } = useAppStore();
  const mockMode = isUsingMocks();

  return (
    <aside className="sidebar">
      {/* Branding */}
      <div className="sidebar__brand">
        <div className="sidebar__logo" aria-hidden="true">
          <Shield size={22} color="var(--accent-400)" strokeWidth={1.8} />
        </div>
        <div>
          <div className="sidebar__app-name">FocusGuard</div>
          <div className="sidebar__tagline">Attention Companion</div>
        </div>
      </div>

      {/* Mock mode badge */}
      {mockMode && (
        <div className="sidebar__mock-badge">
          <span className="badge badge-mock">⚡ Mock Mode</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            className={`sidebar__nav-item${state.currentPage === item.id ? " sidebar__nav-item--active" : ""}`}
            onClick={() => setPage(item.id)}
            aria-current={state.currentPage === item.id ? "page" : undefined}
          >
            <span className="sidebar__nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Connection status */}
      <div className="sidebar__status">
        <div className="sidebar__status-item">
          <span className={`status-dot${state.engineConnected ? " online pulse" : " offline"}`} />
          <span className="sidebar__status-label">Engine</span>
          <span className={`sidebar__status-value${state.engineConnected ? " text-focused" : ""}`}>
            {state.engineConnected ? "Live" : "Offline"}
          </span>
        </div>
        <div className="sidebar__status-item">
          <span className={`status-dot${state.assistantConnected ? " online pulse" : " offline"}`} />
          <span className="sidebar__status-label">Assistant</span>
          <span className={`sidebar__status-value${state.assistantConnected ? " text-focused" : ""}`}>
            {state.assistantConnected ? "Live" : "Offline"}
          </span>
        </div>
      </div>
    </aside>
  );
}
