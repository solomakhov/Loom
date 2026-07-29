import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryState = {
  error: Error | null;
};

export class MaterialErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Не удалось отобразить материал", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="material-error-recovery">
        <h3>Не удалось открыть материал</h3>
        <p>Его содержимое несовместимо с визуальным редактором.</p>
        <button className="text-button primary" type="button" onClick={this.props.onClose}>
          Вернуться к списку
        </button>
      </div>
    );
  }
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Критическая ошибка Loom", error, info);
  }

  private resetNavigation = () => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("loom:navigation:")) {
        window.localStorage.removeItem(key);
      }
    }

    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-error-recovery">
        <div>
          <h1>Loom не смог открыть последнюю страницу</h1>
          <p>Данные проектов не повреждены. Сбросьте только сохранённую позицию в интерфейсе.</p>
          <button className="text-button primary" type="button" onClick={this.resetNavigation}>
            Вернуться к проектам
          </button>
        </div>
      </main>
    );
  }
}
