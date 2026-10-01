import type { KhApi } from '../../shared/types'

declare global {
  interface Window {
    kh: KhApi
  }
}
