import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./ui";
import "./style.css";
const old = window.location.hash.slice(1);
if (["inicio", "estudos", "treinos", "lembretes", "eventos"].includes(old))
  history.replaceState(null, "", old === "inicio" ? "/" : "/" + old);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
