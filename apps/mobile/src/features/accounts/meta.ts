import { Banknote, CreditCard, Landmark, PiggyBank, Smartphone, type LucideIcon } from 'lucide-react-native'

export type AccountType = 'cash' | 'bank' | 'mobile_wallet' | 'card' | 'savings'

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: LucideIcon; example: string }> = {
  cash: { label: 'Cash', icon: Banknote, example: 'Wallet cash' },
  bank: { label: 'Bank', icon: Landmark, example: 'City Bank' },
  mobile_wallet: { label: 'Mobile wallet', icon: Smartphone, example: 'bKash' },
  card: { label: 'Card', icon: CreditCard, example: 'Credit card' },
  savings: { label: 'Savings', icon: PiggyBank, example: 'Savings' },
}

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_META) as AccountType[]
