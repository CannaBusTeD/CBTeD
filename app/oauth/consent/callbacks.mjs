// Where a CBTeD sign-in may send the person back after they approve or deny a connection.
// Dynamic client registration lets any app ask to connect, so only these exact assistant callbacks are
// trusted. Anything else is refused before the consent screen is shown or any decision is sent.
const TRUSTED=[
  {host:"chatgpt.com",path:p=>p.startsWith("/connector")},    // ChatGPT connectors
  {host:"claude.ai",path:p=>p==="/api/mcp/auth_callback"},     // Claude web, desktop and mobile
  {host:"claude.com",path:p=>p==="/api/mcp/auth_callback"}     // Claude's announced future callback
];
export function safeCallbackUrl(text){
  let url;
  try{url=new URL(text);}catch{throw Error("The authorization destination is not a valid address");}
  const trusted=url.protocol==="https:"&&!url.username&&!url.password&&!url.port
    &&TRUSTED.some(t=>url.hostname===t.host&&t.path(url.pathname));
  if(!trusted)throw Error("The authorization destination is not a recognised ChatGPT or Claude callback");
  return url.toString();
}
