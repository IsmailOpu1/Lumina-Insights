import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  console.log("Function invoked, method:", req.method);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("Parsing request body...");
    const { email, role, inviteLink, businessName } = await req.json();
    console.log("Request received:", { email, role, inviteLink, businessName });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    console.log("RESEND_API_KEY exists:", !!RESEND_API_KEY);
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailContent = {
      from: "Lumina Insights <xavirismail90@gmail.com>",
      to: [email],
      subject: `You're invited to join ${businessName} on Lumina Insights`,
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
              Lumina Insights is a powerful business intelligence dashboard that helps you track orders, inventory, expenses, and more.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background: #4A7C59; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
              This link will expire in 24 hours. If you didn't request this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
    };

    console.log("Sending email to:", email);
    console.log("Email content:", JSON.stringify(emailContent));

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailContent),
    });

    console.log("Resend API response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", response.status, error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
