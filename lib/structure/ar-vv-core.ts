/** Portable numerical kernel. Input eligibility is supplied by the strict adapter. */
export type V3 = readonly [number, number, number];
export type Site = Readonly<{atomId:string; position:V3; velocity:V3; force:V3}>;
export const CONFIG = Object.freeze({schemaVersion:'tf.custom-ar-dynamics-model/0.1',mass:39.95,tickFs:0.125,endTick:800,maxSteps:400,maxActions:32,velocityComponentCap:0.01,mvv2e:48.88821291*48.88821291,ftm2v:1/48.88821291/48.88821291,kcalToKj:4.184});
export const UNITS = Object.freeze({position:{unit:'angstrom',dimension:'length',basis:'structure-local Cartesian'},velocity:{unit:'angstrom/fs',dimension:'length/time',basis:'per atom'},force:{unit:'kJ mol^-1 angstrom^-1',dimension:'energy/length',basis:'per atom per mole identical finite systems'},energy:{unit:'kJ/mol',dimension:'energy',basis:'per mole identical finite systems'},mass:{unit:'g/mol',dimension:'mass/amount',basis:'nominal Ar sites, not isotope/sample measurement'},time:{unit:'fs',dimension:'time',basis:'root initializer tick0'},momentum:{unit:'g mol^-1 angstrom fs^-1',dimension:'mass*length/(amount*time)',basis:'sum sites per mole identical finite systems'}});
// Establish the fixed legend before any exported initializer can be called.
for(const quantity of Object.values(UNITS))Object.freeze(quantity);
export function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
export const zero=(x:number)=>x===0?0:x;
export function vector(value:unknown,velocity=false):V3 {
 requireValue(Array.isArray(value)&&value.length===3,'three vector components required');
 requireValue(value.every(x=>typeof x==='number'&&Number.isFinite(x)&&(!velocity||Math.abs(x)<=CONFIG.velocityComponentCap)),'nonfinite vector or velocity computational cap');
 return value.map(zero) as [number,number,number];
}
export function kinetic(sites:readonly Site[]){let sum=0;for(const a of sites)for(const v of a.velocity)sum+=CONFIG.mass*v*v;return zero(.5*CONFIG.mvv2e*sum*CONFIG.kcalToKj);}
export function momentum(sites:readonly Site[]):V3 {const p=[0,0,0];for(const a of sites)for(let k=0;k<3;k++)p[k]+=CONFIG.mass*a.velocity[k];return vector(p);}
export function vvStep(sites:readonly Site[],dtTicks:1|2,evaluate:(positions:readonly Readonly<{atomId:string;position:V3}>[])=>Readonly<{energy:number;forces:readonly Readonly<{atomId:string;force:V3}>[]}>){
 const dt=dtTicks*CONFIG.tickFs,coefficient=.5*dt*CONFIG.ftm2v/CONFIG.mass/CONFIG.kcalToKj;
 const half=sites.map(a=>vector(a.velocity.map((v,k)=>v+coefficient*a.force[k]),true));
 const positions=sites.map((a,i)=>({atomId:a.atomId,position:vector(a.position.map((p,k)=>p+dt*half[i][k]))}));
 const result=evaluate(positions),map=new Map(result.forces.map(a=>[a.atomId,a.force]));
 requireValue(map.size===sites.length&&result.forces.length===sites.length,'force ID bijection');
 const next=sites.map((a,i)=>{const force=map.get(a.atomId);requireValue(force!==undefined,'missing force ID');return {atomId:a.atomId,position:positions[i].position,velocity:vector(half[i].map((v,k)=>v+coefficient*force[k]),true),force:vector(force)};});
 const ke=kinetic(next),h=result.energy+ke;requireValue(Number.isFinite(h),'nonfinite total energy');
 return {sites:next,pe:zero(result.energy),ke,h:zero(h),momentum:momentum(next)};
}
