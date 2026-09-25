import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../design-system/tokens.css";
import "../../../design-system/ui.css";
import "../../../design-system/themes.css";
import "../../../design-system/app.css";
import { ThemeProvider } from "@ieum/ui";
import { Gallery } from "./gallery";

const root = document.getElementById("root");
if (!root) throw new Error("Missing web root");
const queryClient = new QueryClient();
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Gallery />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
