import React from "react";
import { createRoot } from "react-dom/client";
import "../../../design-system/tokens.css";
import "../../../design-system/ui.css";
import "../../../design-system/themes.css";
import { ThemeProvider } from "@ieum/ui";
import { Gallery } from "./gallery";

const root = document.getElementById("root");
if (!root) throw new Error("Missing web root");
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <Gallery />
    </ThemeProvider>
  </React.StrictMode>,
);
