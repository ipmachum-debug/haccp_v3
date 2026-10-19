import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { isChunkLoadError, reloadOnceForNewVersion } from "@/lib/chunkReload";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // 배포 전환 중 화면 조각을 못 불러온 경우 — 한 번만 새로 불러온다 (저장 요청은 다시 보내지 않음)
    if (isChunkLoadError(error)) reloadOnceForNewVersion(error.message);
  }

  render() {
    if (this.state.hasError && isChunkLoadError(this.state.error)) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md p-8 text-center">
            <RotateCcw size={40} className="text-primary mb-4" />
            <h2 className="text-lg mb-2">새 버전이 배포되어 화면을 다시 불러와야 합니다.</h2>
            <p className="text-sm text-muted-foreground mb-6">저장하던 내용이 있었다면, 다시 불러온 뒤 저장됐는지 확인해 주세요.</p>
            <button onClick={() => window.location.reload()} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg min-h-11", "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer")}>
              <RotateCcw size={16} />
              다시 불러오기
            </button>
          </div>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
