import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import "../../../design-system/tokens.css";
import "../../../design-system/ui.css";
import "../../../design-system/themes.css";
import "../../../design-system/app.css";
import { ThemeProvider } from "@ieum/ui";
import { ApiError } from "./shared/api/http";
import { createAppRouter } from "./app/router";

const root = document.getElementById("root");
if (!root) throw new Error("Missing web root");
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Authorization and validation failures do not improve on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});
const router = createAppRouter();
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
