import React from "react";
import { AppProvider, useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { ErrorBanner } from "./components/ErrorBanner";
import { Dashboard } from "./pages/Dashboard";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import "./styles/global.css";
import "./styles/app.css";

function AppShell(): JSX.Element {
  const { state, setError } = useAppStore();

  const renderPage = (): JSX.Element => {
    switch (state.currentPage) {
      case "dashboard": return <Dashboard />;
      case "analytics": return <Analytics />;
      case "settings":  return <Settings />;
      default:          return <Dashboard />;
    }
  };

  return (
    <div className="app">
      <Sidebar />
      <main className="main-content" id="main-content" role="main">
        {state.error && (
          <ErrorBanner message={state.error} onDismiss={() => setError(null)} />
        )}
        {renderPage()}
      </main>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
