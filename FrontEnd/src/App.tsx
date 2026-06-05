import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ClassesPage from "./pages/ClassesPage.tsx";
import ClassDetailPage from "./pages/ClassDetailPage.tsx";
import AssignmentDetailPage from "./pages/AssignmentDetailPage.tsx";
import AnalyticsPage from "./pages/AnalyticsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:classId" element={<ClassDetailPage />} />
          <Route path="/classes/:classId/assignments/:assignmentId" element={<AssignmentDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
