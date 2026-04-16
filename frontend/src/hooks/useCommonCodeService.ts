import { useMemo } from 'react'
import { commonCodeService } from '../services/commonCodeService'

export function useCommonCodeService() {
  return useMemo(() => commonCodeService, [])
}
