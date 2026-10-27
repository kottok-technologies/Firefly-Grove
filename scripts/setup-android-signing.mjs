// Run once locally; --publish uploads the existing key to this repository's secrets.
// Passwords and key bytes are never printed or passed as command-line arguments.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),directory=path.join(root,'android/signing');
const configFile=path.join(directory,'release.properties'),keyFile=path.join(directory,'release.p12');
const repo='kottok-technologies/Firefly-Grove';
if(process.argv[2]==='--publish'){
  const config=Object.fromEntries((await readFile(configFile,'utf8')).trim().split(/\r?\n/).map(line=>line.split('=')));
  const certificate=JSON.parse(await readFile(path.join(directory,'certificate.json'),'utf8'));
  const secrets={ANDROID_KEYSTORE_BASE64:(await readFile(keyFile)).toString('base64'),ANDROID_STORE_PASSWORD:config.STORE_PASSWORD,ANDROID_KEY_ALIAS:config.KEY_ALIAS,ANDROID_KEY_PASSWORD:config.KEY_PASSWORD};
  for(const [name,value] of Object.entries(secrets))execFileSync('gh',['secret','set',name,'--repo',repo],{input:value,stdio:['pipe','pipe','pipe']});
  execFileSync('gh',['variable','set','ANDROID_CERT_SHA256','--repo',repo],{input:certificate.sha256,stdio:['pipe','pipe','pipe']});
  console.log('Persistent signing key uploaded to four GitHub Actions secrets; certificate fingerprint saved as a repository variable.');
}else{
  for(const file of [configFile,keyFile]){
    const exists=await access(file).then(()=>true,()=>false);
    if(exists)throw Error('Signing material already exists. Refusing to replace it. Use --publish to configure GitHub.');
  }
  await mkdir(directory,{recursive:true,mode:0o700});
  if(process.platform==='win32')execFileSync('icacls',[directory,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'pipe'});
  const password=randomBytes(36).toString('hex'),alias='firefly-grove-upload';
  const javaHome=process.env.JAVA_HOME;
  if(!javaHome)throw Error('Set JAVA_HOME to a current JDK before creating the upload key.');
  const keytool=path.join(javaHome,'bin',process.platform==='win32'?'keytool.exe':'keytool');
  const env={...process.env,FIREFLY_KEY_PASSWORD:password};
  execFileSync(keytool,['-genkeypair','-keystore',keyFile,'-storetype','PKCS12','-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Firefly Grove, O=Kottok Technologies','-storepass:env','FIREFLY_KEY_PASSWORD','-keypass:env','FIREFLY_KEY_PASSWORD'],{env,stdio:'pipe'});
  await writeFile(configFile,`KEYSTORE_PATH=signing/release.p12\nSTORE_PASSWORD=${password}\nKEY_ALIAS=${alias}\nKEY_PASSWORD=${password}\n`,{mode:0o600});
  const certFile=path.join(root,'docs/firefly-grove-upload-certificate.crt');
  execFileSync(keytool,['-exportcert','-rfc','-keystore',keyFile,'-alias',alias,'-storepass:env','FIREFLY_KEY_PASSWORD','-file',certFile],{env,stdio:'pipe'});
  const cert=new X509Certificate(await readFile(certFile));
  const metadata={alias,sha1:cert.fingerprint,sha256:cert.fingerprint256,validTo:cert.validTo};
  await writeFile(path.join(directory,'certificate.json'),JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
  await writeFile(path.join(root,'docs/ANDROID_CERTIFICATE.json'),JSON.stringify(metadata,null,2)+'\n');
  console.log('Created persistent signing key in ignored android/signing/. Public certificate and fingerprints are in docs/. Back up the signing folder securely.');
}
