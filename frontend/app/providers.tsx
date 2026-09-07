'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wallet'
import { TreasuryProvider } from '@/lib/treasury-context'

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TreasuryProvider>
          {children}
        </TreasuryProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
