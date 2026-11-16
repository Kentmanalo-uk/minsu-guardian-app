import { useState, useEffect } from 'react'
import { onSessionChange } from './session'
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
