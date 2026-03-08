const Stripe = require("stripe");

const ALLOWED_ORIGINS = new Set([
  "https://mewseum.webflow.io",
  "http://localhost:8888",
  "https://mewseum.ch/",
  // "https://yourdomain.com",
]);

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://mewseum.webflow.io";

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const sk = process.env.STRIPE_SECRET_KEY || "";
    if (!sk || !sk.startsWith("sk_")) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Missing/invalid STRIPE_SECRET_KEY (must start with sk_)" }),
      };
    }

    const stripe = new Stripe(sk);

    const body = JSON.parse(event.body || "{}");
    const priceId = body.priceId;
    const quantity = body.quantity || 1;

    if (!priceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing priceId" }) };
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price: priceId, quantity }],

      // Email is collected by Checkout by default
      phone_number_collection: { enabled: true },

      // Shipping address (Stripe requires allowed countries)
      shipping_address_collection: {
        allowed_countries: ["MA", "FR", "CH", "BE", "DE", "ES", "IT", "NL", "GB", "PT", "US", "CA"],
      },

      // Full name + size
      custom_fields: [
        {
          key: "full_name",
          label: { type: "custom", custom: "Full name" },
          type: "text",
          optional: false,
          text: { minimum_length: 2, maximum_length: 80 },
        },
        {
          key: "size",
          label: { type: "custom", custom: "T-shirt size" },
          type: "dropdown",
          dropdown: {
            options: [
              { label: "Small (S)", value: "S" },
              { label: "Medium (M)", value: "M" },
              { label: "Large (L)", value: "L" },
              { label: "XL", value: "XL" },
            ],
            default_value: "M",
          },
          optional: false,
        },
      ],

      return_url: `${allowOrigin}/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      redirect_on_completion: "if_required",
    });

    return { statusCode: 200, headers, body: JSON.stringify({ clientSecret: session.client_secret }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
};
