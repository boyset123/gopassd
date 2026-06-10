import React from 'react';

/** Passthrough provider retained for layout compatibility. */
export function CreateModalProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
