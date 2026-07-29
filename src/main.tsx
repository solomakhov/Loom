import React from "react";
import ReactDOM from "react-dom/client";
import "@mdxeditor/editor/style.css";
import { App } from "./App";
import { AppErrorBoundary } from "./components/ErrorBoundaries";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
