import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{seal,open} from '../src/index.mjs';
const secret='test-secret-with-at-least-32-characters';
const env={SESSION_SECRET:secret,GITHUB_CLIENT_ID:'test-id',GITHUB_CLIENT_SECRET:'test-client-secret',GITHUB_APP_SLUG:'test-app'};
test('encrypted sessions reject tampering, expiry and another secret',async()=>{
 const value=await seal({token:'private-token',exp:2000},secret);
 assert.ok(!value.includes('private-token'));
 assert.equal((await open(value,secret,1000)).token,'private-token');
 assert.equal(await open(value,secret,2000),null);
 assert.equal(await open(value+'corrupt',secret,1000),null);
 assert.equal(await open(value,secret+'other',1000),null);
});
test('login uses state, PKCE and a protected flow cookie',async()=>{
 const response=await worker.fetch(new Request('https://test.workers.dev/auth/login'),env);
 assert.equal(response.status,302);
 const location=new URL(response.headers.get('Location'));
 assert.equal(location.origin,'https://github.com');
 assert.equal(location.searchParams.get('code_challenge_method'),'S256');
 assert.ok(location.searchParams.get('state'));
 const cookie=response.headers.get('Set-Cookie');
 assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
 const flow=await open(cookie.split(';')[0].split('=')[1],secret);
 assert.equal(flow.state,location.searchParams.get('state'));
});
test('callback without matching browser flow is rejected',async()=>{
 const response=await worker.fetch(new Request('https://test.workers.dev/auth/callback?code=fake&state=fake'),env);
 assert.equal(response.status,400);
});
test('logout requires same origin',async()=>{
 const bad=await worker.fetch(new Request('https://test.workers.dev/logout',{method:'POST',headers:{Origin:'https://evil.example'}}),env);
 assert.equal(bad.status,403);
 const good=await worker.fetch(new Request('https://test.workers.dev/logout',{method:'POST',headers:{Origin:'https://test.workers.dev'}}),env);
 assert.equal(good.status,302);
 assert.match(good.headers.get('Set-Cookie'),/Max-Age=0/);
});
