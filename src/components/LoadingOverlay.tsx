'use client';

type LoadingOverlayProps = {
  show: boolean;
};

export default function LoadingOverlay({ show }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full bg-gray-700 dark:bg-gray-200 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-2.5 w-2.5 rounded-full bg-gray-700 dark:bg-gray-200 animate-bounce"
          style={{ animationDelay: '120ms' }}
        />
        <span
          className="h-2.5 w-2.5 rounded-full bg-gray-700 dark:bg-gray-200 animate-bounce"
          style={{ animationDelay: '240ms' }}
        />
      </div>
    </div>
  );
}
