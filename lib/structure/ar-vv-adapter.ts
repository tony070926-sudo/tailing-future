import {canonicalJson,sha256DigestValue} from './canonical-json';
import {validateStructureDocument,finalizeStructureDocument,structureDocumentToDraft,createValidationReceipt,deepFreeze,type StructureDocument} from './structure-document';
import {parseStructureNativeJsonBytes} from './strict-json';
import {AR_INTERPRETATION,AR_PARAMETERS,createCustomArAction,computeCustomArSinglePoint} from './custom-ar-singlepoint';
import {CONFIG,UNITS,requireValue,vector,vvStep,kinetic,momentum,zero,type Site,type V3} from './ar-vv-core';
export {AR_INTERPRETATION,CONFIG,UNITS};
const ROOT_BYTES=131072,CHECKPOINT_BYTES=1048576;
type Velocity=Readonly<{atomId:string;velocity:V3}>;
type Initializer=Readonly<{document:StructureDocument;velocities:readonly Velocity[];dtTicks:1|2;confirmation:typeof AR_INTERPRETATION}>;
type Change=Readonly<{atomId:string;position:V3}>;
type Journal=Readonly<{kind:'advance';steps:number}|{kind:'fork';changes:readonly Change[]}>;
export type Physical=Readonly<{schemaVersion:'tf.custom-ar-dynamics-physical/0.1';tick:number;dtTicks:1|2;endTick:800;timeFs:number;model:typeof CONFIG;parameters:typeof AR_PARAMETERS;units:typeof UNITS;sites:readonly Site[];pe:number;ke:number;h:number;momentum:V3}>;
type Branch=Readonly<{h0:number;p0:V3;parentStateDigest:string|null;deltaH:number;deltaHIsWork:false;maxEnergyDrift:number;maxMomentumResidual:V3}>;
export type State=Readonly<{schemaVersion:'tf.custom-ar-dynamics-state/0.1';initializer:Initializer;journal:readonly Journal[];document:StructureDocument;physical:Physical;physicalDigest:string;branch:Branch;stateDigest:string;authenticatedProvenance:false;calibratedValidation:false;stress:null;pressure:null;electrons:null;uncertainty:null}>;
const accepted=new WeakSet<object>();
function keys(v:unknown,expected:string):asserts v is Record<string,unknown>{requireValue(v!==null&&typeof v==='object'&&!Array.isArray(v),'record required');requireValue(Object.keys(v).sort().join(',')===expected.split(',').sort().join(','),'unknown/missing contract keys');}
function snapshot<T>(value:unknown,cap:number):T{const text=canonicalJson(value);requireValue(new TextEncoder().encode(text).length<=cap,'canonical input byte limit');return JSON.parse(text) as T;}
function requireState(state:State){requireValue(state!==null&&typeof state==='object'&&accepted.has(state),'state requires initialization or full checkpoint replay');}
function evaluated(document:StructureDocument){
 const receipt=createValidationReceipt(document),action=createCustomArAction(document,receipt,AR_INTERPRETATION),result=computeCustomArSinglePoint(document,receipt,action);
 requireValue(result.decision==='computed',result.decision==='abstain'?result.reason:'single point failure');
 const forces=new Map(result.atomicForces.values.map(f=>[f.atomId,vector([f.x,f.y,f.z])]));
 requireValue(forces.size===document.atoms.length&&result.atomicForces.values.length===document.atoms.length,'static result ID bijection');
 return {energy:result.energy.value,forces};
}
function finish(initializer:Initializer,journal:readonly Journal[],document:StructureDocument,physical:Physical,branch:Branch):State{
 const base={schemaVersion:'tf.custom-ar-dynamics-state/0.1' as const,initializer,journal,document,physical,physicalDigest:sha256DigestValue(physical),branch,authenticatedProvenance:false as const,calibratedValidation:false as const,stress:null,pressure:null,electrons:null,uncertainty:null};
 const state=deepFreeze({...base,stateDigest:sha256DigestValue(base)});accepted.add(state);return state;
}
function physical(sites:readonly Site[],dtTicks:1|2,tick:number,pe:number):Physical{
 const ke=kinetic(sites),h=pe+ke;requireValue(Number.isFinite(h),'nonfinite energy');
 return deepFreeze({schemaVersion:'tf.custom-ar-dynamics-physical/0.1' as const,tick,dtTicks,endTick:800 as const,timeFs:tick*CONFIG.tickFs,model:CONFIG,parameters:AR_PARAMETERS,units:UNITS,sites,pe:zero(pe),ke,h:zero(h),momentum:momentum(sites)});
}
/** Explicit initialization, not an import-triggered execution. */
export function initialize(value:unknown):State {
 const root=snapshot<Initializer>(value,ROOT_BYTES);keys(root,'document,velocities,dtTicks,confirmation');
 requireValue(root.confirmation===AR_INTERPRETATION,'explicit exploratory interpretation required');requireValue(root.dtTicks===1||root.dtTicks===2,'dtTicks must be 1 or 2');
 const document=validateStructureDocument(root.document),result=evaluated(document);requireValue(Array.isArray(root.velocities)&&root.velocities.length===document.atoms.length,'velocity ID bijection');
 const velocities=new Map<string,V3>();for(const row of root.velocities){keys(row,'atomId,velocity');requireValue(typeof row.atomId==='string'&&!velocities.has(row.atomId),'duplicate velocity ID');velocities.set(row.atomId,vector(row.velocity,true));}
 const atoms=[...document.atoms].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const sites=atoms.map(a=>{const velocity=velocities.get(a.id),force=result.forces.get(a.id);requireValue(velocity!==undefined&&force!==undefined,'missing velocity/force ID');return {atomId:a.id,position:vector([a.position.x,a.position.y,a.position.z]),velocity,force};});
 const initial=deepFreeze({document,velocities:sites.map(a=>({atomId:a.atomId,velocity:a.velocity})),dtTicks:root.dtTicks,confirmation:AR_INTERPRETATION});
 const p=physical(sites,root.dtTicks,0,result.energy);return finish(initial,[],document,p,{h0:p.h,p0:p.momentum,parentStateDigest:null,deltaH:0,deltaHIsWork:false,maxEnergyDrift:0,maxMomentumResidual:[0,0,0]});
}
function moved(document:StructureDocument,positions:readonly Change[]):StructureDocument{
 const draft=structureDocumentToDraft(document),map=new Map(positions.map(x=>[x.atomId,x.position]));requireValue(map.size===draft.atoms.length&&positions.length===draft.atoms.length,'position ID bijection');
 for(const atom of draft.atoms){const p=map.get(atom.id);requireValue(p!==undefined,'missing position ID');atom.position={x:p[0],y:p[1],z:p[2]};}
 return finalizeStructureDocument(draft);
}
export type Outcome=Readonly<{decision:'advanced';state:State;frames:readonly Physical[]}|{decision:'abstain';reason:string;state:null;frames:null}>;
/** Original state is immutable; no intermediate state is returned on any failure. */
export function advance(state:State,steps:number):Outcome{
 try{
   requireState(state);requireValue(Number.isInteger(steps)&&steps>=1&&steps<=CONFIG.maxSteps,'action step budget');requireValue(state.journal.length<CONFIG.maxActions,'journal action budget');
   requireValue(state.physical.tick+steps*state.physical.dtTicks<=CONFIG.endTick,'global tick budget');
   let doc=state.document,p=state.physical,branch=state.branch;const frames:Physical[]=[];
   for(let i=0;i<steps;i++){
     const next=vvStep(p.sites,p.dtTicks,positions=>{doc=moved(doc,positions);const result=evaluated(doc);return {energy:result.energy,forces:[...result.forces].map(([atomId,force])=>({atomId,force}))};});
     p=physical(next.sites,p.dtTicks,p.tick+p.dtTicks,next.pe);frames.push(p);
     branch={...branch,maxEnergyDrift:Math.max(branch.maxEnergyDrift,Math.abs(p.h-branch.h0)),maxMomentumResidual:vector(p.momentum.map((v,k)=>Math.max(branch.maxMomentumResidual[k],Math.abs(v-branch.p0[k]))))};
   }
   const result=finish(state.initializer,[...state.journal,{kind:'advance',steps}],doc,p,branch);
   return deepFreeze({decision:'advanced' as const,state:result,frames});
 }catch(e){return deepFreeze({decision:'abstain' as const,reason:e instanceof Error?e.message:'invalid transition',state:null,frames:null});}
}
export function fork(state:State,value:unknown):State {
 requireState(state);requireValue(state.journal.length<CONFIG.maxActions,'journal action budget');const changes=snapshot<Change[]>(value,16384);requireValue(Array.isArray(changes)&&changes.length<=state.physical.sites.length,'coordinate changes list');
 const map=new Map<string,V3>();for(const c of changes){keys(c,'atomId,position');requireValue(typeof c.atomId==='string'&&!map.has(c.atomId)&&state.physical.sites.some(a=>a.atomId===c.atomId),'coordinate edit ID');map.set(c.atomId,vector(c.position));}
 const positions=state.physical.sites.map(a=>({atomId:a.atomId,position:map.get(a.atomId)??a.position}));
 const doc=moved(state.document,positions),result=evaluated(doc);const sites=state.physical.sites.map((a,i)=>{const f=result.forces.get(a.atomId);requireValue(f!==undefined,'fork force ID');return {...a,position:positions[i].position,force:f};});
 const p=physical(sites,state.physical.dtTicks,state.physical.tick,result.energy),deltaH=zero(p.h-state.physical.h);
 const identical=canonicalJson(p)===canonicalJson(state.physical);
 return finish(state.initializer,[...state.journal,{kind:'fork',changes}],doc,p,{h0:identical?state.branch.h0:p.h,p0:state.branch.p0,parentStateDigest:state.stateDigest,deltaH,deltaHIsWork:false,maxEnergyDrift:identical?state.branch.maxEnergyDrift:0,maxMomentumResidual:state.branch.maxMomentumResidual});
}
export function exportCheckpoint(state:State):Uint8Array{
 requireState(state);const bytes=new TextEncoder().encode(canonicalJson({schemaVersion:'tf.custom-ar-dynamics-checkpoint/0.1',state}));requireValue(bytes.length<=CHECKPOINT_BYTES,'checkpoint byte limit');return bytes;
}
export function restoreCheckpoint(bytes:Uint8Array):State{
 requireValue(bytes instanceof Uint8Array&&bytes.byteLength<=CHECKPOINT_BYTES,'checkpoint byte limit');
 const parsed=parseStructureNativeJsonBytes(bytes,null).value;keys(parsed,'schemaVersion,state');requireValue(parsed.schemaVersion==='tf.custom-ar-dynamics-checkpoint/0.1','checkpoint version');
 const claimed=snapshot<State>(parsed.state,CHECKPOINT_BYTES);keys(claimed,'schemaVersion,initializer,journal,document,physical,physicalDigest,branch,stateDigest,authenticatedProvenance,calibratedValidation,stress,pressure,electrons,uncertainty');
 requireValue(Array.isArray(claimed.journal)&&claimed.journal.length<=CONFIG.maxActions,'journal action budget');let actual=initialize(claimed.initializer);
 for(const entry of claimed.journal){
   requireValue(entry!==null&&typeof entry==='object','journal entry');
   if(entry.kind==='advance'){keys(entry,'kind,steps');requireValue(typeof entry.steps==='number','numeric steps');const result=advance(actual,entry.steps);requireValue(result.decision==='advanced',result.decision==='abstain'?result.reason:'replay failure');actual=result.state;}
   else if(entry.kind==='fork'){keys(entry,'kind,changes');actual=fork(actual,entry.changes);}
   else throw new Error('unknown journal action');
 }
 requireValue(canonicalJson(actual)===canonicalJson(claimed),'checkpoint does not replay to full claimed state');return actual;
}
