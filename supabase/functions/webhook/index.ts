import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
