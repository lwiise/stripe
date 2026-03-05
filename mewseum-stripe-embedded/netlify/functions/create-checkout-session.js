const Stripe = require("stripe");

const ALLOWED_ORIGINS = new Set([
  "https://mewseum.webflow.io",
  "http://localhost:8888",
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

  // Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
      return_url: `${allowOrigin}/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      redirect_on_completion: "if_required",
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientSecret: session.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
};
