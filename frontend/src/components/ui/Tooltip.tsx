import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  return (
    <span className="tooltip-trigger inline-flex">
      {children}
      <span className={`tooltip-content ${position === 'bottom' ? 'tooltip-bottom' : ''}`}>
        {content}
      </span>
    </span>
  );
}
