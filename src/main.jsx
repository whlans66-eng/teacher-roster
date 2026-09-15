/**
 * main.jsx — React 進入點
 *
 * Provider 的巢狀順序是有意義的：
 *   ToastProvider   最外層——AuthProvider 失敗時也還能顯示訊息
 *   AuthProvider    次外層——DataProvider 要先知道使用者是誰才能取資料
 *   DataProvider    快取教師／課程／排程
 *   HashRouter      用 hash 路由，內網若部署在子目錄且沒有 rewrite 規則，
 *                   BrowserRouter 會在重新整理時 404，HashRouter 不會。
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import './styles.css';

import AppShell from './components/AppShell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TeacherListPage from './pages/TeacherListPage.jsx';
import TeacherDetailPage from './pages/TeacherDetailPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import { DataProvider } from './state/DataContext.jsx';
import { ToastProvider } from './state/ToastContext.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/teachers" element={<TeacherListPage />} />
                <Route path="/teachers/:id" element={<TeacherDetailPage />} />
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
);
