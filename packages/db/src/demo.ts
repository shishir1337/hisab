import { addDays, addMonths } from '@hisab/core'
import { defaultCategoryId, ensureDefaultCategories } from './defaults'
import type { Executor } from './executor'
import { createAccount, createParty, createTransaction } from './mutations'
import { createLending, recordRepayment } from './people-mutations'
import { createLoan, createRecurringRule, markEmiPaid, setBudget } from './plan-mutations'

/**
 * Development only: fills an empty database with ~60 days of realistic history (accounts, spending,
 * salary, an EMI loan, money lent and borrowed, a budget, recurring items) so every screen can be
 * reviewed with real-looking data. Refuses to run if the user already has accounts.
 */
export async function seedDemoData(ex: Executor, userId: string, today: string): Promise<boolean> {
  const existing = await ex.getOptional<{ n: number }>('select count(*) as n from accounts where deleted_at is null')
  if ((existing?.n ?? 0) > 0) return false
  await ensureDefaultCategories(ex, userId)
  const cat = (name: string, kind: 'income' | 'expense' = 'expense') => defaultCategoryId(userId, kind, name)
  const start = addDays(today, -60)
  const at = (day: string, hh: number) => `${day}T${String(hh).padStart(2, '0')}:15:00.000Z`

  const bank = await createAccount(ex, userId, { name: 'City Bank', type: 'bank', opening_balance_minor: 18_500_000, opening_date: start })
  const bkash = await createAccount(ex, userId, { name: 'bKash', type: 'mobile_wallet', opening_balance_minor: 650_000, opening_date: start })
  const cash = await createAccount(ex, userId, { name: 'Cash', type: 'cash', opening_balance_minor: 820_000, opening_date: start })
  await createAccount(ex, userId, { name: 'DPS Savings', type: 'savings', opening_balance_minor: 32_000_000, opening_date: start })

  const spend = (day: string, amount: number, category: string, note: string | null, account = cash, hh = 13) =>
    createTransaction(ex, userId, { type: 'expense', amount_minor: amount, account_id: account, category_id: cat(category), note, occurred_on: day, occurred_at: at(day, hh) })

  // Daily life: a deterministic pattern so the demo looks the same every time.
  const meals = ['Lunch', 'Tea & snacks', 'Dinner out', 'Breakfast']
  for (let i = 60; i >= 0; i--) {
    const d = addDays(today, -i)
    await spend(d, 18_000 + (i % 5) * 4_500, 'Food', meals[i % meals.length]!, i % 3 === 0 ? bkash : cash, 7)
    if (i % 2 === 0) await spend(d, 12_000 + (i % 4) * 3_000, 'Transport', i % 4 === 0 ? 'Uber' : 'CNG', bkash, 9)
    if (i % 6 === 0) await spend(d, 215_000 + (i % 3) * 40_000, 'Groceries', 'Shwapno', bank, 18)
    if (i % 15 === 3) await spend(d, 180_000, 'Bills & Utilities', 'Electricity + internet', bkash, 11)
    if (i % 20 === 7) await spend(d, 340_000, 'Shopping', 'Daraz order', bank, 21)
    if (i % 25 === 4) await spend(d, 120_000, 'Fun', 'Movie night', cash, 20)
    if (i % 30 === 12) await spend(d, 260_000, 'Health', 'Pharmacy', cash, 10)
  }
  for (const m of [-2, -1, 0]) {
    const pay = addMonths(today.slice(0, 8) + '01', m)
    if (pay > today) continue
    await createTransaction(ex, userId, { type: 'income', amount_minor: 12_500_000, account_id: bank, category_id: cat('Salary', 'income'), note: 'Salary', occurred_on: pay, occurred_at: at(pay, 4) })
    const rentDay = addDays(pay, 4)
    if (rentDay <= today) await spend(rentDay, 3_200_000, 'Rent', 'Flat rent', bank, 6)
  }
  const gig = addDays(today, -18)
  await createTransaction(ex, userId, { type: 'income', amount_minor: 3_600_000, account_id: bank, category_id: cat('Project / Freelance', 'income'), note: 'Logo project', occurred_on: gig, occurred_at: at(gig, 15), original_amount_minor: 30_000, original_currency: 'USD', fx_rate: '120' })
  // ATM withdrawals and bKash top-ups keep the wallets funded.
  for (let i = 58; i >= 0; i -= 10) {
    const d = addDays(today, -i)
    await createTransaction(ex, userId, { type: 'transfer', amount_minor: 1_000_000, account_id: bank, to_account_id: cash, note: 'ATM', occurred_on: d, occurred_at: at(d, 8) })
    await createTransaction(ex, userId, { type: 'transfer', amount_minor: 600_000, account_id: bank, to_account_id: bkash, note: 'Top up', occurred_on: d, occurred_at: at(d, 8) })
  }

  // An EMI loan: 36 months, 10 paid before Hisab, the last two paid in-app.
  const firstDue = addMonths(today.slice(0, 8) + '10', -12)
  const loan = await createLoan(ex, userId, { name: 'Bike loan', emi_amount_minor: 850_000, total_installments: 36, first_due_date: firstDue, installments_paid_before: 10, default_account_id: bank })
  for (const m of [-2, -1]) await markEmiPaid(ex, userId, loan, { occurred_on: addMonths(today.slice(0, 8) + '10', m), account_id: bank })

  // People.
  const rahim = await createParty(ex, userId, { name: 'Rahim Uddin', phone: '+8801712345678' })
  const nadia = await createParty(ex, userId, { name: 'Nadia Islam', phone: '+8801898765432' })
  const tanvir = await createParty(ex, userId, { name: 'Tanvir Ahmed' })
  const l1 = await createLending(ex, userId, { party_id: rahim, direction: 'lent', principal_minor: 1_500_000, started_on: addDays(today, -40), due_on: addDays(today, -5), account_id: bank })
  await recordRepayment(ex, userId, l1, { amount_minor: 500_000, account_id: bkash, occurred_on: addDays(today, -12) })
  await createLending(ex, userId, { party_id: nadia, direction: 'lent', principal_minor: 300_000, started_on: addDays(today, -6), due_on: addDays(today, 10), account_id: cash })
  await createLending(ex, userId, { party_id: tanvir, direction: 'borrowed', principal_minor: 1_000_000, started_on: addDays(today, -25), due_on: addDays(today, 20), account_id: bank })

  // Budgets and recurring items.
  await setBudget(ex, userId, null, 7_000_000)
  await setBudget(ex, userId, cat('Food'), 1_200_000)
  await setBudget(ex, userId, cat('Shopping'), 500_000)
  await createRecurringRule(ex, userId, { type: 'income', amount_minor: 12_500_000, account_id: bank, category_id: cat('Salary', 'income'), note: 'Salary', frequency: 'monthly', anchor_date: addMonths(today.slice(0, 8) + '01', 1), mode: 'confirm' })
  await createRecurringRule(ex, userId, { type: 'expense', amount_minor: 3_200_000, account_id: bank, category_id: cat('Rent'), note: 'Flat rent', frequency: 'monthly', anchor_date: addDays(today, 2), mode: 'confirm' })
  await createRecurringRule(ex, userId, { type: 'expense', amount_minor: 99_900, account_id: bkash, category_id: cat('Fun'), note: 'Netflix', frequency: 'monthly', anchor_date: addDays(today, 6), mode: 'auto' })
  return true
}
