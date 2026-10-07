import { uuidv7 } from 'uuidv7'

/** Time-ordered UUIDv7, generated on the client so rows can be created offline. */
export const newId = (): string => uuidv7()
