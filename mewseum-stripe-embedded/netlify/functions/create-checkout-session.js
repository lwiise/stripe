const Stripe = require("stripe");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // ✅ Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const sk = process.env.STRIPE_SECRET_KEY || "";
    if (!sk || sk.startsWith("pk_")) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "STRIPE_SECRET_KEY must be sk_live_... or sk_test_..." }) };
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
      return_url: `https://mewseum.webflow.io/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      redirect_on_completion: "if_required",
    });

    return { statusCode: 200, headers, body: JSON.stringify({ clientSecret: session.client_secret }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
};
