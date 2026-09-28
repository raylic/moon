import { useCallback, useEffect, useRef, useState } from "react";
import "./ui.css";

/**
 * M4 — toast。画布 `反馈组件一览` ①：深色胶囊 #2E2A2B / r12 / padding 11×18 / 12px 白字，
 * 水平居中在页面顶部（Header 下方 y=73）。
 *
 * 用法：
 *   const toast = useToast();
 *   toast.show("还不能记录未来的日期");
 *   ...
 *   <Toast message={toast.message} />
 */
export interface ToastHandle {
  message: string | null;
  show: (message: string) => void;
}

export function useToast(duration = 2000): ToastHandle {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (next: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setMessage(next);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, duration);
    },
    [duration],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}

export default function Toast({ message }: { message: string | null }): JSX.Element {
  return (
    <div className="toast-layer" aria-live="polite">
      {message !== null && <div className="toast">{message}</div>}
    </div>
  );
}