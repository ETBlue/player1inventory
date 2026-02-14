import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
