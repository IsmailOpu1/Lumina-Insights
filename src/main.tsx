import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initMonitoring } from "./lib/monitoring.ts";
import { setupPwa } from "./lib/pwa.ts";
import { watchPasswordRecovery } from "./lib/recovery.ts";
import "./index.css";
import "./styles/animations.css";

initMonitoring();
setupPwa();
watchPasswordRecovery();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
