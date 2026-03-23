import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';

import InputPage from './components/InputPage';
import AnalysisPage from './components/AnalysisPage';
import VarianceResolutionPage from './components/VarianceResolutionPage';
import FundsPage from './components/FundsPage';
import Layout from './components/Layout';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import RestaurantsPage from './components/RestaurantsPage';
import RestaurantDetailsPage from './components/RestaurantDetailsPage';
import ActivityLogsPage from './components/ActivityLogsPage';
import RestaurantPaymentsPage from './components/RestaurantPaymentsPage';
import TransferAccountsPage from './components/TransferAccountsPage';
import ArchivesPage from './components/ArchivesPage';
import EmployeesPage from './components/EmployeesPage';
import OperationsGridPage from './components/OperationsGridPage';
import PdfSplitterPage from './components/tools/PdfSplitterPage';
import LoanRequestsPage from './components/LoanRequestsPage';
import BranchesPage from './components/BranchesPage';
import BranchHubPage from './components/BranchHubPage';
import PermissionsMatrixPage from './components/PermissionsMatrixPage';
import LoanReportsPage from './components/LoanReportsPage';
import RestaurantPaymentHistoryPage from './components/RestaurantPaymentHistoryPage';
import WalletLiquidityPage from './components/WalletLiquidityPage';
import DeveloperFeedbackPage from './components/DeveloperFeedbackPage';
import InvoiceDisbursementPage from './components/InvoiceDisbursementPage';
import BatchEntriesPage from './components/BatchEntriesPage';
import PhonePaymentsPage from './components/PhonePaymentsPage';
import DeductionsPage from './components/DeductionsPage';
import BulkTransferTool from './components/tools/BulkTransferTool';
import CurrencySyncTool from './components/tools/CurrencySyncTool';
import SumDisbursementPage from './components/SumDisbursementPage';
import BankAccountsPage from './components/BankAccountsPage';
import ChartOfAccountsPage from './components/ChartOfAccountsPage';
import JournalEntryPage from './components/JournalEntryPage';
import ErrorBoundary from './components/ErrorBoundary';

import { AppContext } from './AppContext';
import { useAppData } from './src/hooks/useAppData';

// Import global toast (overrides window.alert)
import './utils/toast';

// Helper to scroll to top
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

// Official Colors
const officialColors = {
  header: '#C62828',
  sidebar: '#263238',
  active: '#FFB300',
  link: '#4FC3F7',
  background: '#F5F5F5',
  success: '#4CAF50'
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const appData = useAppData(navigate);
  const [showRetry, setShowRetry] = useState(false);

  // Apply color scheme (official)
  const applyColorScheme = (colors: any) => {
    const root = document.documentElement;
    root.style.setProperty('--color-sidebar', colors.sidebar);
    root.style.setProperty('--color-header', colors.header);
    root.style.setProperty('--color-active', colors.active);
    root.style.setProperty('--color-link', colors.link);
    // root.style.setProperty('--color-bg-light', colors.background);
    root.style.setProperty('--color-success', colors.success);

    // Also set old names for backward compatibility if any components still use them
    root.style.setProperty('--sidebar-bg', colors.sidebar);
    root.style.setProperty('--header-bg', colors.header);
    root.style.setProperty('--accent-color', colors.active);
    root.style.setProperty('--link-color', colors.link);
    // root.style.setProperty('--bg-light', colors.background);
    root.style.setProperty('--success-color', colors.success);
  };

  useEffect(() => {
    applyColorScheme(officialColors);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (appData.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [appData.theme]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (appData.isLoading) {
      timer = setTimeout(() => setShowRetry(true), 8000); // Show retry after 8 seconds
    }
    return () => clearTimeout(timer);
  }, [appData.isLoading]);

  if (appData.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 flex-col gap-6" dir="rtl">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-[#C62828] animate-spin">
              incomplete_circle
            </span>
          </div>
        </div>

        <div className="text-center space-y-2 animate-pulse">
          <h2 className="text-xl font-black text-slate-800 dark:text-white">جاري تحضير الادارة المالية...</h2>
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">يتم الاتصال بقاعدة البيانات وتحديث السجلات</p>
        </div>

        {showRetry && (
          <div className="animate-fade-in mt-4 flex flex-col items-center gap-3">
            <p className="text-xs text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
              يبدو أن الاتصال يستغرق وقتاً أطول من المعتاد
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#C62828] text-white rounded-xl hover:bg-red-700 transition font-bold shadow-lg flex items-center gap-2"
            >
              <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold tracking-widest uppercase opacity-50">V1.1.2</span>
              <span className="material-symbols-outlined text-sm">refresh</span>
              إعادة تحميل الصفحة
            </button>
          </div>
        )}
      </div>
    );
  }

  const { currentUser, featureFlags, theme } = appData;

  // Add colors to appData to satisfy AppContextType
  const fullAppContext = {
    ...appData,
    colors: {
      positive: '#d97706', // amber-600
      negative: '#dc2626', // red-600
      matched: '#10b981'   // emerald-500
    }
  };

  return (
    <div dir="rtl" className={theme === 'dark' ? 'dark' : ''}>
      <AppContext.Provider value={fullAppContext}>
        <ScrollToTop />
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={!(currentUser?.id) ? <LoginPage /> : <Navigate to="/" />} />

            {/* Protected Routes with Sidebar Layout */}
            <Route path="/" element={(currentUser?.id) ? <Layout /> : <Navigate to="/login" />}>
              <Route index element={<DashboardPage />} />

              <Route path="input" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('recon_view')) ? <InputPage /> : <Navigate to="/" />
              } />

              <Route path="analysis" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_view')) ? <AnalysisPage /> : <Navigate to="/" />
              } />

              <Route path="variance-resolution" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_view')) ? <VarianceResolutionPage /> : <Navigate to="/" />
              } />

              <Route path="funds" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('funds_view')) ? <FundsPage /> : <Navigate to="/" />
              } />

              <Route path="liquidity-review" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('funds_view') && featureFlags.wallet_liquidity !== false)) ? <WalletLiquidityPage /> : <Navigate to="/" />
              } />

              <Route path="restaurants" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_view')) ? <RestaurantsPage /> : <Navigate to="/" />
              } />

              <Route path="restaurants/:id" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_view')) ? <RestaurantDetailsPage /> : <Navigate to="/" />
              } />

              <Route path="activity-logs" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('logs_view')) ? <ActivityLogsPage /> : <Navigate to="/" />
              } />

              <Route path="restaurant-payments" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('payments_view') && featureFlags.restaurant_payments !== false)) ? <RestaurantPaymentsPage /> : <Navigate to="/" />
              } />

              <Route path="payments/history" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('payments_view')) ? <RestaurantPaymentHistoryPage /> : <Navigate to="/" />
              } />

              <Route path="transfer-accounts" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('restaurants_add') && featureFlags.transfer_accounts !== false)) ? <TransferAccountsPage /> : <Navigate to="/" />
              } />

              <Route path="archives" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_view')) ? <ArchivesPage /> : <Navigate to="/" />
              } />

              <Route path="loan-requests" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('loans_view') && featureFlags.loan_requests !== false)) ? <LoanRequestsPage /> : <Navigate to="/" />
              } />

              <Route path="loan-reports" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('loan_reports_view')) ? <LoanReportsPage /> : <Navigate to="/" />
              } />

              <Route path="operations-grid" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('restaurants_view') && featureFlags.operations_grid !== false)) ? <OperationsGridPage /> : <Navigate to="/" />
              } />

              <Route path="tools/pdf-splitter" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('restaurants_view') && featureFlags.pdf_splitter !== false)) ? <PdfSplitterPage /> : <Navigate to="/" />
              } />

              <Route path="employees" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_view')) ? <EmployeesPage /> : <Navigate to="/" />
              } />

              <Route path="branches" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('branches_view')) ? <BranchesPage /> : <Navigate to="/" />
              } />

              <Route path="branches/:branchId/hub" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('branches_view')) ? <BranchHubPage /> : <Navigate to="/" />
              } />

              <Route path="users" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('users_permissions')) ? <PermissionsMatrixPage /> : <Navigate to="/" />
              } />

              <Route path="developer-feedback" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('developer_access') && featureFlags.developer_feedback !== false)) ? <DeveloperFeedbackPage /> : <Navigate to="/" />
              } />

              <Route path="invoice-batches" element={
                (currentUser?.role === 'super_admin' || ((currentUser?.permissions?.includes('invoice_manage') || currentUser?.permissions?.includes('invoice_batches_view')) && featureFlags.invoice_disbursement !== false)) ? <InvoiceDisbursementPage /> : <Navigate to="/" />
              } />

              <Route path="invoice-batches/:batchId/entries" element={
                (currentUser?.role === 'super_admin' || ((currentUser?.permissions?.includes('financial_details_view') || currentUser?.permissions?.includes('financial_details_manage')) && featureFlags.invoice_disbursement !== false)) ? <BatchEntriesPage /> : <Navigate to="/" />
              } />

              <Route path="phone-payments" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('phone_payments_manage') && featureFlags.phone_payments !== false)) ? <PhonePaymentsPage /> : <Navigate to="/" />
              } />

              <Route path="sum-disbursement" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('invoice_manage') && featureFlags.sum_disbursement !== false)) ? <SumDisbursementPage /> : <Navigate to="/" />
              } />

              <Route path="deductions" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('deductions_view')) ? <DeductionsPage /> : <Navigate to="/" />
              } />

              <Route path="tools/bulk-transfer" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('tools_manage') && featureFlags.bulk_transfer_tool !== false)) ? <BulkTransferTool /> : <Navigate to="/" />
              } />

              <Route path="tools/currency-sync" element={
                (currentUser?.role === 'super_admin' || (currentUser?.permissions?.includes('tools_manage') && featureFlags.currency_sync_tool !== false)) ? <CurrencySyncTool /> : <Navigate to="/" />
              } />

              <Route path="bank-accounts" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_add')) ? <BankAccountsPage /> : <Navigate to="/" />
              } />

              <Route path="chart-of-accounts" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('chart_of_accounts_manage') || currentUser?.permissions?.includes('journal_entries_manage')) ? <ChartOfAccountsPage /> : <Navigate to="/" />
              } />

              <Route path="journal-entries" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('journal_entries_manage')) ? <JournalEntryPage /> : <Navigate to="/" />
              } />

              <Route path="permissions-matrix" element={
                (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('users_permissions')) ? (
                  <React.Suspense fallback={<div>جاري التحميل...</div>}>
                    {(() => {
                      const PermissionsMatrixPage = React.lazy(() => import('./components/PermissionsMatrixPage'));
                      return <PermissionsMatrixPage />;
                    })()}
                  </React.Suspense>
                ) : <Navigate to="/" />
              } />

              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AppContext.Provider>
    </div>
  );
};

export default App;