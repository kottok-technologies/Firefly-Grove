import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const mode=process.argv[2];
const directory=path.resolve(process.env.RUNNER_TEMP||path.join(root,'android/signing'),'firefly-signing');
if(mode==='prepare'){
  const required=['ANDROID_KEYSTORE_BASE64','ANDROID_STORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD','ANDROID_CERT_SHA256'];
  for(const name of required)if(!process.env[name])throw Error(`Missing ${name}; release signing must be configured.`);
  await mkdir(directory,{recursive:true,mode:0o700});
  const keystore=path.join(directory,'release.p12');
  await writeFile(keystore,Buffer.from(process.env.ANDROID_KEYSTORE_BASE64,'base64'),{mode:0o600});
  await writeFile(process.env.GITHUB_ENV,`ANDROID_KEYSTORE_PATH=${keystore}\n`,{flag:'a'});
}else if(mode==='verify'){
  const certificate=JSON.parse(await readFile(path.join(root,'docs/ANDROID_CERTIFICATE.json'),'utf8')).sha256;
  if(process.env.ANDROID_CERT_SHA256&&process.env.ANDROID_CERT_SHA256!==certificate)throw Error('Repository certificate variable differs from the committed release certificate.');
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
  if(!sdk)throw Error('Set ANDROID_HOME to verify the APK signing certificate.');
  const buildTools=process.env.ANDROID_BUILD_TOOLS||'36.0.0';
  const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
  const apk=path.resolve(process.argv[3]||path.join(root,'android/app/build/outputs/apk/release/app-release.apk'));
  const output=execFileSync(java,['-jar',path.join(sdk,'build-tools',buildTools,'lib/apksigner.jar'),'verify','--print-certs',apk],{encoding:'utf8'});
  const actual=output.match(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]+)$/im)?.[1];
  if(!actual||actual.toUpperCase()!==certificate.replace(/:/g,'').toUpperCase())throw Error('APK certificate does not match the persistent release key.');
  console.log('APK signature verified against the persistent release certificate.');
}else if(mode==='clean'){
  // Only remove the dedicated runner folder, never a caller-provided target.
  await rm(path.join(directory,'release.p12'),{force:true});
}else if(mode==='certificate'){
  const certificate=new X509Certificate(await readFile(process.argv[3]));
  console.log(JSON.stringify({sha1:certificate.fingerprint,sha256:certificate.fingerprint256},null,2));
}else throw Error('Use prepare, verify, clean, or certificate.');
