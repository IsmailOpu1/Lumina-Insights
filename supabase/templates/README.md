# Auth email templates

Branded emails for Supabase Auth. They are plain tables with inline styles,
so they render in Gmail, Outlook, Apple Mail and phone mail apps.

## How they get to Supabase

The subjects and files are wired up in `supabase/config.toml`. After
editing a template, push it with:

    supabase config push

The command shows a diff and asks before changing anything. The `[auth]`
section in `config.toml` mirrors the live settings (Site URL, redirect
URLs, confirmations, 2FA), so the push changes only what you edited. If
you change one of those settings in the dashboard, change it in
`config.toml` too, or the next push will undo it.

Pasting by hand also works: **Authentication → Emails → Templates**, set
the subject and paste the whole HTML file into the body.

| Supabase template   | Subject                                         | File                      |
|---------------------|-------------------------------------------------|---------------------------|
| Confirm sign up     | Confirm your email to start your Lumina trial   | `confirm_signup.html`     |
| Invite user         | You've been invited to Lumina Insights          | `invite.html`             |
| Magic link          | Your Lumina sign-in link                        | `magic_link.html`         |
| Change email address| Confirm your new email address for Lumina       | `change_email.html`       |
| Reset password      | Reset your Lumina password                      | `reset_password.html`     |
| Reauthentication    | Your Lumina verification code                   | `reauthentication.html`   |

Team invites from Settings are sent by the `send-invite-email` function,
not by these templates.

## Sender name and address

Templates only change the content. Supabase's built-in sender is for
testing (a few emails per hour, from a Supabase address). For launch, set
**Authentication → Emails → SMTP Settings** to Resend with a verified
domain, sender name `Lumina Insights` and an address such as
`no-reply@yourdomain.com`.

## Variables used

`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .Token }}`,
`{{ .SiteURL }}` and `{{ .Data.full_name }}` (the name given at sign-up).
