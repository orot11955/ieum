import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, useRouteError } from "react-router";
import { Notice } from "@ieum/ui";
import { RequireSession } from "../features/auth/session-boundary";
import { LoginPage, SecondFactorPage } from "../pages/auth-pages";
import { InvitationPage } from "../pages/invitation-page";
import {
  CaptureDetailPage,
  CaptureEditPage,
  CaptureListPage,
  CaptureSplitPage,
  NewCapturePage,
} from "../pages/capture-pages";
import {
  HomePage,
  InvitationsPage,
  NotFoundPage,
  SettingsPage,
} from "../pages/app-pages";
import { AppShell } from "./shell";

// Design spikes stay out of production bundles.
const Gallery = import.meta.env.DEV
  ? lazy(() => import("../dev/gallery").then((m) => ({ default: m.Gallery })))
  : null;

function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <main className="ieum-auth-page" id="main">
      <div className="ieum-auth ieum-stack">
        <div className="ieum-brand">이음</div>
        <Notice tone="danger">
          화면을 표시하지 못했습니다. 새로고침해도 계속되면 잠시 후 다시 시도해
          주세요.
        </Notice>
        <Link to="/" reloadDocument>
          홈으로
        </Link>
      </div>
    </main>
  );
}

export function createAppRouter() {
  return createBrowserRouter([
    {
      path: "/login",
      element: <LoginPage />,
      errorElement: <RouteErrorPage />,
    },
    {
      path: "/login/verify",
      element: <SecondFactorPage />,
      errorElement: <RouteErrorPage />,
    },
    {
      path: "/invitation",
      element: <InvitationPage />,
      errorElement: <RouteErrorPage />,
    },
    ...(Gallery
      ? [
          {
            path: "/dev/gallery",
            element: (
              <Suspense fallback={null}>
                <Gallery />
              </Suspense>
            ),
          },
        ]
      : []),
    {
      path: "/",
      element: <RequireSession>{(me) => <AppShell me={me} />}</RequireSession>,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "captures", element: <CaptureListPage /> },
        { path: "captures/new", element: <NewCapturePage /> },
        { path: "captures/:id", element: <CaptureDetailPage /> },
        { path: "captures/:id/edit", element: <CaptureEditPage /> },
        { path: "captures/:id/split", element: <CaptureSplitPage /> },
        { path: "settings", element: <SettingsPage /> },
        { path: "ops/invitations", element: <InvitationsPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);
}
