// User-facing guidance for email confirmation and Supabase auth cooldowns.
// Kept separate from DOM code so the tricky error cases can be unit-tested.

export function isTemporaryRegistrationLimit(error) {
  if (!error) return false;
  const status = Number(error.status);
  const code = String(error.code || "").toLowerCase();
  const detail = String(error.message || "");
  return status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit", "too_many_requests"].includes(code) ||
    /for security purposes|you can only request this after|rate.limit|too many requests/i.test(detail);
}

export function isEmailConfirmationRequired(error) {
  if (!error) return false;
  return String(error.code || "").toLowerCase() === "email_not_confirmed" ||
    /email (?:is )?not confirmed|confirm your email|email.*not verified/i.test(String(error.message || ""));
}

export function registrationNotice(kind, email) {
  const address = email ? " for " + email : "";
  if (kind === "cooldown") return {
    title: "Your request may already have gone through",
    description: "Supabase is temporarily limiting registration requests" + address + ". Your earlier request may already have succeeded.",
    instructions: "Check your inbox and spam folder for the confirmation email from Supabase. Tap the confirmation link if it arrived. Only try registering again after the security cooldown if there is no email."
  };
  if (kind === "unconfirmed") return {
    title: "Confirm your email first",
    description: "A confirmation email may already have been sent" + address + ".",
    instructions: "Open your inbox or spam folder, find the Supabase confirmation email and tap its link. Then come back to CBTeD and sign in."
  };
  return {
    title: "Check your email",
    description: "Your registration request has been received" + address + ".",
    instructions: "Look for a confirmation email from Supabase, including in your spam folder. Open it and tap the verification link. Then return here and sign in. You do not need to register twice."
  };
}
