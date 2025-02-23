'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'


import { usePathname, useSearchParams } from "next/navigation"
import { usePostHog } from 'posthog-js/react'

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  // Track pageviews
  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      if (searchParams.toString()) {
        url = url + "?" + searchParams.toString();
      }

      posthog.capture('$pageview', { '$current_url': url })
    }
  }, [pathname, searchParams, posthog])

  return null
}

export function PostHogProvider({ children }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
      capture_pageview: false // Disable automatic pageview capture, as we capture manually
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}
