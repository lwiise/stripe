const Stripe = require("stripe");

const ALLOWED_SIZES = new Set(["S", "M", "L", "XL"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY || "";
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || "";
    const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";

    if (!secretKey.startsWith("sk_")) {
      return json(500, { error: "Missing or invalid STRIPE_SECRET_KEY" });
    }

    if (!webhookSecret.startsWith("whsec_")) {
      return json(500, { error: "Missing or invalid STRIPE_WEBHOOK_SECRET" });
    }

    if (!appsScriptUrl.startsWith("https://script.google.com/")) {
      return json(500, { error: "Missing or invalid GOOGLE_APPS_SCRIPT_URL" });
    }

    if (!appsScriptSecret) {
      return json(500, { error: "Missing GOOGLE_APPS_SCRIPT_SECRET" });
    }

    const stripe = new Stripe(secretKey);

    const signature =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"] ||
      "";

    if (!signature) {
      return json(400, { error: "Missing Stripe-Signature header" });
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    if (stripeEvent.type !== "checkout.session.completed") {
      return json(200, {
        ok: true,
        ignored: true,
        event_type: stripeEvent.type,
      });
    }

    const session = stripeEvent.data.object;

    if (session.payment_status !== "paid") {
      return json(200, {
        ok: true,
        ignored: true,
        reason: "Session not paid",
      });
    }

    // Get latest session data
    const fullSession = await stripe.checkout.sessions.retrieve(session.id);

    // Read size from your existing Stripe custom field
    const customFields = Array.isArray(fullSession.custom_fields)
      ? fullSession.custom_fields
      : [];

    const sizeField = customFields.find((field) => field.key === "size");
    const size = String(sizeField?.dropdown?.value || "")
      .trim()
      .toUpperCase();

    if (!ALLOWED_SIZES.has(size)) {
      return json(400, { error: `Invalid or missing size: ${size}` });
    }

    // Get quantity from line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
    });

    const qty =
      lineItems.data.reduce((sum, item) => {
        return sum + Number(item.quantity || 0);
      }, 0) || 1;

    const payload = {
      secret: appsScriptSecret,
      stripe_event_id: stripeEvent.id,
      checkout_session_id: fullSession.id,
      payment_intent_id:
        typeof fullSession.payment_intent === "string"
          ? fullSession.payment_intent
          : fullSession.payment_intent?.id || "",
      customer_email:
        fullSession.customer_details?.email ||
        fullSession.customer_email ||
        "",
      size,
      qty,
      paid_at: new Date(stripeEvent.created * 1000).toISOString(),
      match_source: "custom_field_size",
    };

    const gsRes = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const gsText = await gsRes.text();

    if (!gsRes.ok) {
      return json(500, {
        error: "Apps Script request failed",
        apps_script_status: gsRes.status,
        apps_script_body: gsText,
      });
    }

    return json(200, {
      ok: true,
      size,
      qty,
      stripe_event_id: stripeEvent.id,
      apps_script_response: safeJson(gsText),
    });
  } catch (err) {
    return json(400, {
      error: err?.message || "Webhook failed",
    });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
