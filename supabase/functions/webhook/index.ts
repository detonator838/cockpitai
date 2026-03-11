import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendNotificationEmail(to: string, subject: string, htmlContent: string) {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.error("BREVO_API_KEY not configured, skipping email");
      return;
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Agent Monitor", email: "noreply@brevo.com" },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Brevo email error:", data);
    }
  } catch (err) {
    console.error("Email send failed:", err);
  }
}

function buildAlertEmailHtml(agentName: string, severity: string, title: string, description: string): string {
  const color = severity === "critical" ? "#dc2626" : "#ea580c";
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:${color};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">${severity.toUpperCase()} Alert</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Agent: <strong>${agentName}</strong></p>
        <h3 style="margin:0 0 12px;">${title}</h3>
        ${description ? `<p style="margin:0;color:#374151;">${description.substring(0, 500)}</p>` : ""}
      </div>
    </div>`;
}

function buildApprovalEmailHtml(agentName: string, title: string, description: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#2563eb;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Approval Required</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Agent: <strong>${agentName}</strong></p>
        <h3 style="margin:0 0 12px;">${title}</h3>
        ${description ? `<p style="margin:0 0 16px;color:#374151;">${description.substring(0, 500)}</p>` : ""}
        <p style="margin:0;color:#6b7280;font-size:14px;">Please review this action in your dashboard.</p>
      </div>
    </div>`;
}


  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Extract agent ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    // Path: /webhook/<agent-id>  — last segment is the agent id
    const agentId = pathParts[pathParts.length - 1];

    if (!agentId || agentId === "webhook") {
      return new Response(
        JSON.stringify({ error: "Missing agent ID in URL path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const providedSecret = authHeader.replace("Bearer ", "");

    // Init Supabase with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch agent and validate secret
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, organization_id, risk_level, webhook_secret, status")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agent.webhook_secret !== providedSecret) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agent.status === "paused") {
      return new Response(
        JSON.stringify({ error: "Agent is paused" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const { event_type, title, description, severity } = body;

    if (!event_type || typeof event_type !== "string") {
      return new Response(
        JSON.stringify({ error: "event_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!title || typeof title !== "string") {
      return new Response(
        JSON.stringify({ error: "title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validSeverities = ["info", "warning", "error", "critical"];
    const sev = validSeverities.includes(severity) ? severity : "info";

    // Determine status based on risk level and event type
    const needsApproval =
      agent.risk_level === "high" && event_type.startsWith("action");
    const eventStatus = needsApproval ? "pending_approval" : "logged";

    // Insert event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        agent_id: agent.id,
        organization_id: agent.organization_id,
        event_type,
        title: title.substring(0, 500),
        description: (description || "").substring(0, 5000),
        severity: sev,
        status: eventStatus,
        raw_payload: body,
      })
      .select("id")
      .single();

    if (eventError) {
      console.error("Event insert error:", eventError);
      return new Response(
        JSON.stringify({ error: "Failed to store event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create approval request if needed
    if (needsApproval) {
      const { error: approvalError } = await supabase
        .from("approval_requests")
        .insert({
          event_id: event.id,
          agent_id: agent.id,
          organization_id: agent.organization_id,
        });

      if (approvalError) {
        console.error("Approval insert error:", approvalError);
      }

      // Send email for new approval request
      await sendNotificationEmail(
        agent.owner_email,
        `🔔 Approval Required: ${title.substring(0, 100)}`,
        buildApprovalEmailHtml(agent.name || agentId, title, description || "")
      );
    }

    // Send email for error/critical severity events
    if (sev === "error" || sev === "critical") {
      await sendNotificationEmail(
        agent.owner_email,
        `🚨 ${sev.toUpperCase()} Alert: ${title.substring(0, 100)}`,
        buildAlertEmailHtml(agent.name || agentId, sev, title, description || "")
      );
    }

    return new Response(
      JSON.stringify({ success: true, event_id: event.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
