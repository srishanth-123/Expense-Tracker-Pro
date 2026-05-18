import { Component } from 'react';

/**
 * React Error Boundary — catches any JS errors in child component tree.
 * Prevents the whole app from white-screening on unexpected errors.
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // In production, send to an error tracking service (Sentry, etc.)
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100vh', gap: '16px',
                    fontFamily: 'Inter, sans-serif', background: '#0f172a', color: '#e2e8f0'
                }}>
                    <div style={{ fontSize: '48px' }}>⚠️</div>
                    <h1 style={{ fontSize: '24px', margin: 0 }}>Something went wrong</h1>
                    <p style={{ color: '#94a3b8', textAlign: 'center', maxWidth: '400px' }}>
                        An unexpected error occurred. Please refresh the page or contact support if the problem persists.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 24px', background: '#6366f1', color: 'white',
                            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                        }}
                    >
                        Refresh Page
                    </button>
                    {import.meta.env.DEV && this.state.error && (
                        <pre style={{
                            background: '#1e293b', padding: '16px', borderRadius: '8px',
                            fontSize: '12px', color: '#f87171', maxWidth: '600px', overflow: 'auto'
                        }}>
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
