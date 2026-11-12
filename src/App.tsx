/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Users } from "./pages/Users";
import { Lifts } from "./pages/Lifts";
import { HistoryPage } from "./pages/History";
import { NotificationsPage } from "./pages/Notifications";
import { Login } from "./pages/Login";
import { AssignmentPage } from "./pages/Assignment";
import { ProtectedRoute, PublicRoute } from "./routes/ProtectedRoutes";
import { useRealtimeSync } from "./hooks/useRealtimeSync";

export default function App() {

  // Khởi động đồng bộ dữ liệu tự động (Realtime + Polling)
  // useRealtimeSync tự xử lý fetchInitialData khi user đăng nhập — không gọi trùng ở đây
  useRealtimeSync();

  return (
    <BrowserRouter>
      <Routes>

          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>

          <Route path="/assignment" element={
            <ProtectedRoute>
              <AssignmentPage />
            </ProtectedRoute>
          } />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="reports" element={<Reports />} />

              {/* Placeholders for other routes */}
              <Route path="lifts" element={<Lifts />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
      </Routes>
    </BrowserRouter>
  );
}

