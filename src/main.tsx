import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { registerPwa } from "./app/pwa";
import "./tokens.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root 不存在");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
registerPwa();