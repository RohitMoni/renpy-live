const FLOW = '__Host-renpy-flow';
const SESSION = '__Host-renpy-session';
const enc = new TextEncoder();
const dec = new TextDecoder();
export const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64 = text => Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function key(secret) {
  if (!secret || secret.length < 32) throw new Error('Missing session encryption secret');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256',enc.encode(secret)), 'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(value, secret) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),enc.encode(JSON.stringify(value)));
  return b64(iv)+'.'+b64(new Uint8Array(ciphertext));
}
export async function open(value, secret, now=Date.now()) {
  try {
    const [iv,data]=value.split('.');
    const result=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await key(secret),unb64(data))));
    return Number.isFinite(result.exp) && result.exp>now ? result : null;
  } catch {return null;}
}
function cookie(name,value,age) {return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;}
function readCookie(request,name) {return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function headers(type='text/html; charset=utf-8') {return new Headers({'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});}
function html(body,status=200) {return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renpy Live · GitHub</title><style>body{font:16px system-ui;max-width:760px;margin:8vh auto;padding:24px;background:#14131b;color:#eeeaf6}a{color:#c2a2ff}li,p{line-height:1.7}button{padding:10px 16px}</style><h1>Renpy Live · GitHub connection</h1>${body}</html>`,{status,headers:headers()});}
function redirect(url,cookies=[]) {const h=headers();h.set('Location',url);for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:302,headers:h});}
async function github(path,token) {
  const response=await fetch('https://api.github.com'+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'renpy-live','X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub request failed');
  return response.json();
}
export default {async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/health')return new Response(JSON.stringify({ok:true,configured:!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET&&env.SESSION_SECRET&&env.GITHUB_APP_SLUG)}),{headers:headers('application/json')});
  if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.SESSION_SECRET||!env.GITHUB_APP_SLUG)return html('<p>Worker deployed. Complete the GitHub App configuration and add the required Worker variables and secrets.</p>',503);
  try {
    if(url.pathname==='/auth/login'&&request.method==='GET') {
      const state=random(),verifier=random();
      const target=new URL('https://github.com/login/oauth/authorize');
      target.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:url.origin+'/auth/callback',state,code_challenge:b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier)))),code_challenge_method:'S256'}).toString();
      return redirect(target.href,[cookie(FLOW,await seal({state,verifier,exp:Date.now()+600000},env.SESSION_SECRET),600)]);
    }
    if(url.pathname==='/auth/callback'&&request.method==='GET') {
      const flow=await open(readCookie(request,FLOW),env.SESSION_SECRET);
      if(!flow||flow.state!==url.searchParams.get('state')||!url.searchParams.get('code'))return html('<p>Login expired or was declined. <a href="/auth/login">Try again</a>.</p>',400);
      const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:url.origin+'/auth/callback',code_verifier:flow.verifier})});
      const token=await response.json();
      if(!response.ok||!token.access_token)throw new Error('Login failed');
      const user=await github('/user',token.access_token);
      const age=Math.min(token.expires_in||28800,28800);
      return redirect('/',[cookie(FLOW,'',0),cookie(SESSION,await seal({token:token.access_token,login:user.login,exp:Date.now()+age*1000},env.SESSION_SECRET),age)]);
    }
    if(url.pathname==='/logout'&&request.method==='POST') {
      if(request.headers.get('Origin')!==url.origin)return html('<p>Invalid request origin.</p>',403);
      return redirect('/',[cookie(SESSION,'',0),cookie(FLOW,'',0)]);
    }
    if(url.pathname==='/'&&request.method==='GET') {
      const session=await open(readCookie(request,SESSION),env.SESSION_SECRET);
      const install=`https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`;
      const editor=env.EDITOR_URL||'https://rohitmoni.github.io/renpy-live/';
      if(!session)return html(`<p><a href="/auth/login">Sign in with GitHub</a></p><p><a href="${escape(install)}">Install the GitHub App on selected game repositories</a></p><p><a href="${escape(editor)}">Back to editor</a></p>`);
      const installations=await github('/user/installations?per_page=100',session.token);
      const results=[];
      for(const installation of installations.installations.slice(0,10)) {
        const data=await github(`/user/installations/${installation.id}/repositories?per_page=100`,session.token);
        results.push(...data.repositories);
      }
      return html(`<p>Signed in as <strong>${escape(session.login)}</strong>.</p><h2>Accessible repositories</h2><ul>${results.map(repo=>`<li><a href="${escape(repo.html_url)}">${escape(repo.full_name)}</a></li>`).join('')||'<li>No repositories yet. Install the app on a repository, then reload.</li>'}</ul><p>This setup check shows up to 100 repositories per installation, for up to 10 installations.</p><p><a href="${escape(install)}">Configure repository access</a> · <a href="${escape(editor)}">Back to editor</a></p><form action="/logout" method="post"><button>Sign out</button></form>`);
    }
    return html('<p>Not found.</p>',404);
  } catch {
    return html('<p>GitHub authentication or repository lookup failed. Check configuration, or <a href="/auth/login">sign in again</a>.</p>',502);
  }
}};
