import { ViewTransition, type ReactNode } from 'react'

/**
 * Route change: the old page fades out quickly, the new one rises in (CSS `.page` in globals.css). Lives in
 * each page, not the layout: layouts persist across navigations, so enter/exit would never fire there.
 * `default="none"`: data updates, refreshes and other transitions inside the page don't animate.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  )
}
