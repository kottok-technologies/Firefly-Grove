import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createHandler} from '../aws-leaderboard/src/service.mjs';
import {privacyDocument} from '../web/privacy-policy.js';

test('privacy policy is public HTML without authentication or database access',async()=>{
  const store=new Proxy({},{get(){throw Error('Policy must not access player data');}});
  const handler=createHandler(store);
  for(const path of ['/api/v1/privacy','/api/v1/privacy/','/privacy-policy.html']){
    const response=await handler({rawPath:path,requestContext:{http:{method:'GET'}},headers:{authorization:'Bearer invalid'}});
    assert.equal(response.statusCode,200);assert.equal(response.headers['content-type'],'text/html; charset=utf-8');
    assert.equal(response.body,privacyDocument);assert.match(response.headers['content-security-policy'],/default-src 'none'/);
    const dom=new JSDOM(response.body),document=dom.window.document;
    assert.match(document.querySelector('h1').textContent,/Firefly Grove Privacy Policy/);
    assert.equal(document.querySelectorAll('script,iframe,img,form').length,0);
    assert.ok(document.querySelector('#delete-data'));
    assert.ok(document.querySelector('a[href="mailto:kottok.technologies@gmail.com"]'));
    dom.window.close();
  }
  const head=await handler({path:'/privacy-policy.html',httpMethod:'HEAD'});
  assert.equal(head.statusCode,200);assert.equal(head.body,'');assert.match(head.headers['content-type'],/text\/html/);
  assert.equal((await readFile(new URL('../web/privacy.html',import.meta.url),'utf8')).trimEnd(),privacyDocument,'offline and public policies stay identical');
});

test('terms are public on the SDK URL path without player data', async () => {
  const store = new Proxy({}, {get() { throw Error('Terms must not access player data'); }});
  const handler = createHandler(store);
  const request = {rawPath: '/terms-of-service.html', headers: {authorization: 'Bearer invalid'}};
  const get = await handler({...request, requestContext: {http: {method: 'GET'}}});
  assert.equal(get.statusCode, 200);
  assert.equal(get.headers['content-type'], 'text/html; charset=utf-8');
  const {window} = new JSDOM(get.body);
  try {
    assert.equal(window.document.querySelector('h1').textContent, 'Firefly Grove Terms of Service');
    assert.equal(window.document.querySelectorAll('script, iframe, img, form').length, 0);
    assert.ok(window.document.querySelector('a[href$="/privacy-policy.html"]'));
  } finally {
    window.close();
  }
  const head = await handler({...request, requestContext: {http: {method: 'HEAD'}}});
  assert.equal(head.statusCode, 200);
  assert.deepEqual(head.headers, get.headers);
  assert.equal(head.body, '');
});
