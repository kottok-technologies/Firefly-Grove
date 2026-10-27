const adjectives=['Amber','Breezy','Cozy','Dappled','Gentle','Golden','Happy','Little','Misty','Quiet','Silver','Sunny'];
const creatures=['Badger','Cricket','Fern','Finch','Firefly','Fox','Moth','Otter','Owl','Robin','Sprout','Wren'];

export function createProfile(){
  const entropy=crypto.getRandomValues(new Uint32Array(3));
  return {localId:crypto.randomUUID(),name:adjectives[entropy[0]%adjectives.length]+creatures[entropy[1]%creatures.length]+String(entropy[2]%10000).padStart(4,'0')};
}

// One registration at a time, even when Settings and Race are opened together.
// The local ID stays stable offline; the server issues its own authenticated ID.
export function profileManager({profiles,origin,api,persist}){
  const profile=profiles[origin] ||= createProfile();
  profile.localId ||= profile.id;
  let registration=null;
  async function ensureOnline(){
    if(profile.token)return profile;
    if(!registration)registration=(async()=>{
      const registered=await api('players',{method:'POST',body:{name:profile.name}});
      Object.assign(profile,registered);persist();return profile;
    })().finally(()=>{registration=null;});
    return registration;
  }
  async function rename(value){
    const name=value.normalize('NFC').trim().replace(/\s+/g,' ');
    if(!/^[\p{L}\p{N} ._'’-]{2,20}$/u.test(name))throw Error('Use 2–20 letters, numbers, spaces, or simple punctuation.');
    if(registration)await registration;
    if(profile.token){
      const updated=await api('profile',{method:'PUT',profile,body:{name}});
      Object.assign(profile,updated);
    }else profile.name=name;
    persist();return profile;
  }
  return {profile,ensureOnline,rename};
}
