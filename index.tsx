import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare state to satisfy strict type checking
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // State is initialized in the property declaration, but can be done here too.
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', color: '#333' }}>
          <h1>Algo deu errado.</h1>
          <p>Ocorreu um erro ao carregar a aplicação.</p>
          <pre style={{ background: '#f0f0f0', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
            {this.state.error?.message}
          </pre>
          <p>Se você está vendo isso após o deploy, verifique:</p>
          <ul>
            <li>Se a variável de ambiente <code>API_KEY</code> foi configurada corretamente.</li>
            <li>Se houve erros no console do navegador (F12).</li>
          </ul>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);