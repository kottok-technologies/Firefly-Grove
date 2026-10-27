import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderDialog,dialogNames} from '../web/dialogs.js';

test('every dialog renders dynamic values as inert text, preserving its controls',()=>{
  const dom=new JSDOM('<main id="dialog"></main>'),root=dom.window.document.getElementById('dialog');
  const attacks=['<img src=x onerror="alert(1)">','</p><script>alert(1)</script>','<svg onload="alert(1)">','" autofocus onfocus=alert(1) x="'];
  for(const name of dialogNames){
    renderDialog(root,name);const controls=[...root.querySelectorAll('button,input')].map(node=>node.id);
    for(const payload of attacks){
      const values=Object.fromEntries([...root.querySelectorAll('[data-text]')].map(node=>[node.dataset.text,payload]));
      renderDialog(root,name,values);
      for(const slot of root.querySelectorAll('[data-text]'))assert.equal(slot.textContent,payload);
      assert.equal(root.querySelectorAll('script,img,svg,iframe,object,embed').length,0);
      assert.deepEqual([...root.querySelectorAll('button,input')].map(node=>node.id),controls);
      for(const node of root.querySelectorAll('*'))assert.ok([...node.attributes].every(attribute=>!attribute.name.startsWith('on')));
    }
  }
  assert.throws(()=>renderDialog(root,'__proto__'));assert.throws(()=>renderDialog(root,'<script>'));
  renderDialog(root,'journeyWin',{details:0,next:'Next'});assert.equal(root.querySelector('[data-text="details"]').textContent,'0');
  dom.window.close();
});
