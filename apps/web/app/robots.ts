import type { MetadataRoute } from 'next'

/** A private app: only the sign-in page may be crawled; everything else is personal (and behind sign-in anyway). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/sign-in', disallow: '/' },
  }
}
