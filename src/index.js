
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      let database = "not_configured";

      if (env.DB) {
        try {
          await env.DB.prepare("SELECT 1").first();
          database = "connected";
        } catch {
          database = "error";
        }
      }

      return response({
        service: "IRON TV MAX API",
        status: "ok",
        database,
      }, database === "error" ? 503 : 200);
    }

    if (url.pathname === "/api/orders" && request.method === "POST") {
      if (!env.DB) {
        return response({ error: "Database not configured" }, 503);
      }

      try {
        const body = await request.json();
        const customer = String(body.customer_name || "").trim();
        const contact = String(body.contact || "").trim();
        const device = String(body.device || "").trim();
        const message = String(body.message || "").trim();

        if (!customer || !contact) {
          return response({
            error: "Customer name and contact are required"
          }, 400);
        }

        if (customer.length > 120 || contact.length > 120 ||
            device.length > 100 || message.length > 1000) {
          return response({ error: "Input too long" }, 400);
        }

        const result = await env.DB.prepare(`
          INSERT INTO orders
            (customer_name, contact, device, message, amount_cents,
             payment_status, order_status)
          VALUES (?, ?, ?, ?, 5000, 'pending', 'new')
        `).bind(customer, contact, device, message).run();

        return response({
          success: true,
          order_id: result.meta.last_row_id,
          amount_cents: 5000,
          payment_status: "pending",
          message: "Order received. Payment must be confirmed manually."
        }, 201);
      } catch {
        return response({
          error: "Could not create order. Check the database schema."
        }, 500);
      }
    }

    if (url.pathname === "/api/orders" && request.method === "GET") {
      if (!env.ADMIN_TOKEN) {
        return response({ error: "Admin authentication not configured" }, 503);
      }

      if (request.headers.get("Authorization") !==
          `Bearer ${env.ADMIN_TOKEN}`) {
        return response({ error: "Unauthorized" }, 401);
      }

      if (!env.DB) {
        return response({ error: "Database not configured" }, 503);
      }

      try {
        const result = await env.DB.prepare(
          "SELECT * FROM orders ORDER BY created_at DESC LIMIT 100"
        ).all();

        return response({ orders: result.results });
      } catch {
        return response({ error: "Could not load orders" }, 500);
      }
    }

    return response({ error: "Not found" }, 404);
  },
};
