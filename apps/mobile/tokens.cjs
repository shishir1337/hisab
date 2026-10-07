// Tailwind's config loader is CommonJS and can't import the TypeScript token package directly,
// so it is loaded through jiti.
const { createJiti } = require('jiti')
module.exports = createJiti(__filename)('@hisab/tokens')
