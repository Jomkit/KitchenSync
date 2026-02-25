import { Component, type ErrorInfo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { logger } from "../logging/logger";
import { AppCrashedPage } from "../pages/AppCrashedPage";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("app render error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <MemoryRouter>
          <AppCrashedPage />
        </MemoryRouter>
      );
    }
    return this.props.children;
  }
}
