// ─────────────────────────────────────────────────────────────
//  Glidecast — site configuration
//  Edit this file to plug in your own payment links and details.
//  See glidecast/README.md for the full setup guide.
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  name: 'Glidecast',

  // Shown on the legal pages and in the footer.
  ownerName: 'Ravindra Patel',
  supportEmail: 'support@example.com', // TODO: replace with your support inbox
  country: 'India',

  // Prices shown on the website (USD). Keep them in sync with your Lemon Squeezy products.
  pricing: {
    monthly: 12,     // $ per month, billed monthly
    yearly: 96,      // $ per year (shown as $8/mo)
  },

  // Lemon Squeezy checkout links (Products → Share → copy the checkout URL).
  // Leave empty until your store is approved — buttons will show a friendly notice.
  checkout: {
    monthly: '',
    yearly: '',
  },

  // Used to verify license keys belong to YOUR store/products.
  // Find these in Lemon Squeezy → Settings → Stores (store ID) and Products (product IDs).
  lemonSqueezy: {
    storeId: null,      // e.g. 123456
    productIds: [],     // e.g. [234567]
  },

  // Customer portal where subscribers manage/cancel billing.
  // e.g. 'https://YOURSTORE.lemonsqueezy.com/billing'
  customerPortal: '',

  // Free plan limits
  free: {
    maxSeconds: 300,   // 5 minutes per recording/export
    maxHeight: 720,    // export resolution cap
  },

  // Local testing only: unlock Pro without a key. NEVER leave true in production.
  devForcePro: false,
};
