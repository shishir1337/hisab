import { expect, it } from 'vitest'
import { defaultCategoryId } from '../src/defaults'

// Value returned by the live Postgres seed for this user (seed_default_categories, verified via MCP).
it('client id matches the server seed id for Food', () =>
  expect(defaultCategoryId('0192f5a0-0000-7000-8000-0000000000aa', 'expense', 'Food')).toBe('ec526091-12c7-b20a-c65a-3871ae7f65bf'))
