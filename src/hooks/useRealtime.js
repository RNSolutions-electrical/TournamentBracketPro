import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtime(table, onPayload) {
  const cbRef = useRef(onPayload)
  cbRef.current = onPayload

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        cbRef.current(payload)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])
}
