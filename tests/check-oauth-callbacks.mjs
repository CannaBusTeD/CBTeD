import assert from "node:assert/strict";
import test from "node:test";
import {safeCallbackUrl} from "../app/oauth/consent/callbacks.mjs";

test("the consent page returns people only to ChatGPT's and Claude's real callbacks",()=>{
  for(const ok of [
    "https://chatgpt.com/connector/oauth/d0_lrYwQBRKG",
    "https://chatgpt.com/connector/oauth/d0_lrYwQBRKG?code=abc&state=xyz",
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz",
    "https://claude.com/api/mcp/auth_callback?code=abc&state=xyz"
  ])assert.equal(new URL(safeCallbackUrl(ok)).hostname,new URL(ok).hostname,ok);
});
test("lookalike, insecure or redirected destinations are refused",()=>{
  for(const bad of [
    "http://claude.ai/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback/../../evil",
    "https://claude.ai/api/mcp/auth_callbackx",
    "https://claude.ai/login",
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "https://evil.example/api/mcp/auth_callback",
    "https://user:pass@claude.ai/api/mcp/auth_callback",
    "https://claude.ai:8443/api/mcp/auth_callback",
    "https://www.claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com.evil.example/connector/x",
    "https://chatgpt.com/other",
    "javascript:alert(1)",
    "not a url",
    ""
  ])assert.throws(()=>safeCallbackUrl(bad),/not a (recognised|valid)/,bad);
});
