import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sends the email for an invite the caller owns. Recipient, role, business
// name and link all come from the database, never from the request, so the
// function can't be used to send arbitrary email.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { invite_id } = await req.json();
    if (!invite_id) return json({ error: "invite_id is required" }, 400);

    // RLS only returns invites owned by the caller.
    const { data: invite } = await supabase
      .from("invites")
      .select("email, role, token, used, expires_at")
      .eq("id", invite_id)
      .maybeSingle();
    if (!invite) return json({ error: "Invite not found" }, 404);
    if (invite.used || new Date(invite.expires_at) < new Date()) {
      return json({ error: "Invite is no longer valid" }, 400);
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("business_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "Email service not configured" }, 500);

    const siteUrl = (Deno.env.get("SITE_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
    if (!siteUrl) return json({ error: "SITE_URL is not configured" }, 500);

    const businessName = escapeHtml(settings?.business_name || "A business");
    const role = escapeHtml(invite.role);
    const link = `${siteUrl}/invite/${encodeURIComponent(invite.token)}`;
    const from = Deno.env.get("RESEND_FROM") || "Lumina Insights <onboarding@resend.dev>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [invite.email],
        subject: `You're invited to join ${settings?.business_name || "a team"} on Lumina Insights`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #4A7C59, #3d6a4b); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Lumina Insights</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
            <h2 style="color: #333; margin-top: 0;">You're Invited!</h2>
            <p style="color: #666; line-height: 1.6;">
              <strong>${businessName}</strong> has invited you to join their team as a <strong>${role}</strong> on Lumina Insights.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Lumina Insights is a business intelligence dashboard that helps you track orders, inventory, expenses, and more.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background: #4A7C59; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
              This link will expire in 24 hours. If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
      }),
    });

    if (!response.ok) {
      console.error("Resend API error:", response.status, await response.text());
      return json({ error: "Failed to send email" }, 502);
    }

    const data = await response.json();
    return json({ success: true, messageId: data.id });
  } catch (e) {
    console.error("send-invite-email error:", e);
    return json({ error: "Unknown error" }, 500);
  }
});
