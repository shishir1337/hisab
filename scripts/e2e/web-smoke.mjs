import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'

const [, , base, outDir] = process.argv
const jar = []
const sb = createServerClient(process.env.SB_URL, process.env.SB_KEY, {
  cookies: { getAll: () => jar, setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((j) => j.name === c.name); if (i >= 0) jar.splice(i, 1); jar.push(c) } } },
})
const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD })
if (error) throw error

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true })
await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, url: base })))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const steps = []
const step = async (name, fn) => {
  try {
    await fn()
    steps.push(`ok   ${name}`)
  } catch (e) {
    steps.push(`FAIL ${name}: ${String(e).split('\n')[0]}`)
    await page.screenshot({ path: `${outDir}/fail-${steps.length}.png` })
  }
}

await step('settings: add account', async () => {
  await page.goto(base + '/settings', { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Cash')
  await page.getByLabel('Balance', { exact: true }).fill('5000')
  await page.getByRole('button', { name: 'Add account' }).last().click()
  await page.getByText('5,000 BDT').first().waitFor({ timeout: 5000 })
})

await step('home: N opens quick log and saves an expense', async () => {
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByText('Total balance').waitFor()
  await page.keyboard.press('n')
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: /Groceries/ }).waitFor({ timeout: 5000 })
  await page.getByLabel('Amount').fill('250')
  await page.getByLabel('Find category').fill('Food')
  await page.getByLabel('Find category').press('Enter')
  await page.getByLabel('Note').fill('Lunch')
  await page.getByRole('button', { name: /^Save/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 })
  await page.getByText('Lunch').first().waitFor({ timeout: 5000 })
  await page.getByText('4,750').first().waitFor({ timeout: 5000 })
})
await page.screenshot({ path: `${outDir}/m5-home.png` })

await step('activity: row listed; Cmd+K opens command bar', async () => {
  await page.goto(base + '/activity', { waitUntil: 'load' })
  await page.getByRole('cell', { name: 'Lunch' }).waitFor({ timeout: 5000 })
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Type a command…').waitFor({ timeout: 3000 })
  await page.keyboard.press('Escape')
})
await page.screenshot({ path: `${outDir}/m5-activity.png` })

await step('report: totals and CSV export', async () => {
  await page.goto(base + '/reports', { waitUntil: 'load' })
  await page.getByText('Spending by category').waitFor()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.getByRole('button', { name: 'CSV' }).click()])
  const path = `${outDir}/report.csv`
  await dl.saveAs(path)
  const csv = fs.readFileSync(path, 'utf8')
  if (!csv.includes('Lunch') || !csv.includes('250')) throw new Error('csv missing row: ' + csv.slice(0, 200))
})
await page.screenshot({ path: `${outDir}/m5-report.png` })

await step('dark mode screenshot of home', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByText('Total balance').waitFor()
  await page.waitForTimeout(400)
})
await page.screenshot({ path: `${outDir}/m5-home-dark.png` })

console.log(steps.join('\n'))
console.log('errors:', JSON.stringify(errors.slice(0, 5)))
await browser.close()
