import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface Props {
  label: string;
  children: ReactNode;
}

/** Contains a render crash to one dashboard section so the rest of the page keeps working. */
export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[dashboard] ${this.props.label} failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <Card className="p-6 text-center text-sm text-muted-foreground" role="alert">
          {this.props.label} is unavailable right now.
        </Card>
      );
    }
    return this.props.children;
  }
}
