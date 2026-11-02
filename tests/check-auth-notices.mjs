import assert from "node:assert/strict";
import {
  isTemporaryRegistrationLimit,
  isEmailConfirmationRequired,
  registrationNotice
} from "../app/auth-notices.mjs";

// The precise cooldown wording actually seen by the first CBTeD registrant.
assert.equal(isTemporaryRegistrationLimit({
  message: "For security purposes, you can only request this after 26 seconds."
}), true);
assert.equal(isTemporaryRegistrationLimit({ status: 429 }), true);
assert.equal(isTemporaryRegistrationLimit({ code: "over_email_send_rate_limit" }), true);
assert.equal(isTemporaryRegistrationLimit({ message: "Invalid login credentials", status: 400 }), false);
assert.equal(isEmailConfirmationRequired({ code: "email_not_confirmed" }), true);
assert.equal(isEmailConfirmationRequired({ message: "Email not confirmed" }), true);
assert.equal(isEmailConfirmationRequired({ message: "Invalid login credentials" }), false);

const success = registrationNotice("submitted", "visitor@example.test");
assert.match(success.title, /Check your email/);
assert.match(success.description, /visitor@example\.test/);
assert.match(success.instructions, /confirmation email/);
assert.match(success.instructions, /spam/);
assert.match(success.instructions, /link/);

const cooldown = registrationNotice("cooldown", "visitor@example.test");
assert.match(cooldown.title, /may already have gone through/);
assert.match(cooldown.description, /may already have succeeded/);
assert.match(cooldown.instructions, /try registering again after/);
assert.doesNotMatch(cooldown.description, /has definitely succeeded/i);

const unconfirmed = registrationNotice("unconfirmed", "visitor@example.test");
assert.match(unconfirmed.title, /Confirm your email first/);
assert.match(unconfirmed.instructions, /sign in/);

console.log("CBTeD signup and confirmation message tests passed.");
