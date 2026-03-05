Mewseum — Stripe Embedded Checkout (Netlify Functions)

1) Deploy this folder to Netlify (recommended: push to GitHub and connect the repo).
2) In Netlify -> Site settings -> Environment variables:
   - STRIPE_SECRET_KEY = your Stripe secret key (sk_live_... or sk_test_...)
3) Your function endpoint will be:
   https://<your-site>.netlify.app/.netlify/functions/create-checkout-session

CORS is preconfigured for:
- https://mewseum.webflow.io
If you later use a custom domain, add it to ALLOWED_ORIGINS in the function file.
