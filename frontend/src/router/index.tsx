import {
  Navigate,
  createBrowserRouter,
} from "react-router-dom";

import { RequireAuth } from "../auth/AuthContext";
import Auth from "../pages/Auth";
import Account from "../pages/Account";
import DashboardLayout from "../layouts/DashboardLayout";
import ProductAnalysisLayout from "../layouts/ProductAnalysisLayout";

import Home from "../pages/Home";
import Analyze from "../pages/Analyze";
import History from "../pages/History";

import Dashboard from "../pages/Dashboard";
import Reviews from "../pages/Reviews";
import Issues from "../pages/Issues";
import Risk from "../pages/Risk";
import Competitor from "../pages/Competitor";

const router = createBrowserRouter([
  ...(["login", "register", "forgot-password", "reset-password"] as const).map(mode => ({path: `/${mode}`, element: <Auth key={mode} mode={mode} />})),
  {element: <RequireAuth />, children: [
  {path: "/account", element: <DashboardLayout><Account /></DashboardLayout>},
  {
    path: "/",
    element: (
      <DashboardLayout fullWidth>
        <Home />
      </DashboardLayout>
    ),
  },

  {
    path: "/analyze",
    element: (
      <DashboardLayout fullWidth>
        <Analyze />
      </DashboardLayout>
    ),
  },

  {
    path: "/history",
    element: (
      <DashboardLayout fullWidth>
        <History />
      </DashboardLayout>
    ),
  },

  {
    path: "/products/:productId",
    element: (
      <DashboardLayout>
        <ProductAnalysisLayout />
      </DashboardLayout>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="dashboard" replace />,
      },
      {
        path: "dashboard",
        element: <Dashboard />,
      },
      {
        path: "reviews",
        element: <Reviews />,
      },
      {
        path: "issues",
        element: <Issues />,
      },
      {
        path: "risk",
        element: <Risk />,
      },
      {
        path: "competitor",
        element: <Competitor />,
      },
    ],
  },

  /*
   * ============================================================
   * LEGACY ROUTES
   * ============================================================
   * Giữ tạm route cũ để không vỡ link cũ dạng:
   * /dashboard?productId=5
   * /reviews?productId=5
   * /issues?productId=5
   * /risk?productId=5
   */

  {
    path: "/dashboard",
    element: (
      <DashboardLayout>
        <Dashboard />
      </DashboardLayout>
    ),
  },

  {
    path: "/reviews",
    element: (
      <DashboardLayout>
        <Reviews />
      </DashboardLayout>
    ),
  },

  {
    path: "/issues",
    element: (
      <DashboardLayout>
        <Issues />
      </DashboardLayout>
    ),
  },

  {
    path: "/risk",
    element: (
      <DashboardLayout>
        <Risk />
      </DashboardLayout>
    ),
  },

  {
    path: "/competitor",
    element: (
      <DashboardLayout>
        <Competitor />
      </DashboardLayout>
    ),
  },

  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
  ]},
]);

export default router;
