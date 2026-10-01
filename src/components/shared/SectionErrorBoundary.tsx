import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Contains a render error to one section, so an unexpected response shape shows
 * an inline message instead of blanking the whole page.
 */
export class SectionErrorBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.title}] render failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-4 text-sm">
        <span className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" /> {this.props.title} could not be shown: {this.state.error.message}
        </span>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          Retry
        </Button>
      </div>
    );
  }
}
