'use client';

import { useEnsureHandle } from '@/hooks/useEnsureHandle';

export default function ClientGate({ children }: { children: React.ReactNode }) {
  useEnsureHandle();
  return <>{children}</>;
}
