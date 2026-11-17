import { useState, useEffect } from 'react'
import { clearSession, onSessionChange } from './session'
import { authApi } from './api'

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSessionChange(async (session) => {
      setCurrentUser(session?.user ?? null)

      if (session) {
        // Ask the Auth service for the current role (it may have changed since login)
        try {
          const profile = await authApi.me()
          setUserRole(profile.role)
        } catch (error) {
          console.error('Error fetching user role:', error)
          if (error.status === 403) {
            clearSession()
            setUserRole(null)
            return
          }
          setUserRole(session.user?.role ?? 'officer')
        }
      } else {
        setUserRole(null)
      }

      setLoading(false)
    })
  }, [])

  return { currentUser, userRole, loading }
}
