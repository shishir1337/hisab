// Screenshots of every web screen (desktop + phone width, light + dark) with demo data, for design review.
// Usage: E2E_EMAIL=… E2E_PASSWORD=… SB_URL=… SB_KEY=… node scripts/e2e/web-screens.mjs http://localhost:3000 ./out
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'

const [, , base, outDir] = process.argv
fs.mkdirSync(outDir, { recursive: true })
const jar = []
const sb = createServerClient(process.env.SB_URL, process.env.SB_KEY, {
  cookies: { getAll: () => jar, setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((j) => j.name === c.name); if (i >= 0) jar.splice(i, 1); jar.push(c) } } },
})
const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD })
if (error) throw error

const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const routes = [['home', '/'], ['activity', '/activity'], ['plan', '/plan'], ['people', '/people'], ['reports', '/reports'], ['settings', '/settings']]
const variants = [
  { name: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { name: 'phone-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true },
]
const errors = []
for (const v of variants) {
  const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.colorScheme, deviceScaleFactor: 2, isMobile: v.isMobile, hasTouch: v.hasTouch })
  await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, url: base })))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${v.name}: ${String(e)}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${v.name}: ${m.text()}`))
  // Each context has its own browser database: seed it (no-op if it already has data).
  await page.goto(base + '/?demo=1', { waitUntil: 'load' })
  await page.getByText('Total balance').first().waitFor({ timeout: 90000 })
  await page.waitForTimeout(1500)
  for (const [name, path] of routes) {
    if (only && !only.includes(name)) continue
    await page.goto(base + path, { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${outDir}/${v.name}-${name}.png`, fullPage: true })
  }
  if (!only || only.includes('quicklog')) {
    await page.goto(base + '/', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    if (v.isMobile) await page.getByRole('button', { name: /new entry|log/i }).first().click().catch(() => {})
    else await page.keyboard.press('n')
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${outDir}/${v.name}-quicklog.png` })
    await page.keyboard.press('Escape')
    if (!v.isMobile) {
      await page.waitForTimeout(400)
      await page.keyboard.press('Control+k')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${outDir}/${v.name}-command.png` })
      await page.keyboard.press('Escape')
    }
  }
  await ctx.close()
}
// Signed out
const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p2 = await anon.newPage()
await p2.goto(base + '/sign-in', { waitUntil: 'load' })
await p2.waitForTimeout(800)
await p2.screenshot({ path: `${outDir}/signin.png` })
await browser.close()
fs.writeFileSync(`${outDir}/errors.txt`, errors.join('\n'))
console.log(`done; ${errors.length} console errors`)
