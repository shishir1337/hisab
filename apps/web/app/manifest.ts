import type { MetadataRoute } from 'next'
import { tokens } from '@hisab/tokens'

/** Web app manifest: what an installed Hisab looks like on the home screen (Android, desktop; iOS reads parts). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Hisab',
    short_name: 'Hisab',
    description: 'Know where your money goes — without the month-end struggle.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone'],
    orientation: 'portrait',
    // The launch background matches the light page; the launch intro takes over from it.
    background_color: tokens.color.light.page,
    theme_color: tokens.color.light.page,
    categories: ['finance', 'productivity'],
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    launch_handler: { client_mode: 'focus-existing' },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
    shortcuts: [
      { name: 'Log money', short_name: 'Log', url: '/?log=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Activity', url: '/activity', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Plan', url: '/plan', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
