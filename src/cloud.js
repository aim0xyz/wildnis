import { createClient } from '@supabase/supabase-js';
import { t } from './i18n.js';
import { IS_CRAZYGAMES } from './platform.js';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY;

class CloudSave {
  constructor(){
    // Im CrazyGames-Build läuft die Cloud ausschließlich über deren Data-Modul
    // (siehe platform.js); der eigene Supabase-Login bleibt komplett aus.
    this.enabled=!IS_CRAZYGAMES&&!!(url&&key);
    this.client=this.enabled?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
    this.session=null;this.listeners=new Set();this.saveTimer=null;this.pendingSave=null;
  }
  snapshot(extra={}){return{enabled:this.enabled,signedIn:!!this.session,user:this.session?.user||null,...extra};}
  emit(extra={}){const state=this.snapshot(extra);for(const listener of this.listeners)listener(state);}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener);}
  async init(){
    if(!this.client){this.emit({message:'Cloud-Speicher nicht konfiguriert'});return this.snapshot();}
    const {data,error}=await this.client.auth.getSession();
    if(error)throw error;
    this.session=data.session;
    this.client.auth.onAuthStateChange((_event,session)=>{this.session=session;this.emit();});
    this.emit();return this.snapshot();
  }
  async signIn(email,password){
    if(!this.client)throw new Error('Supabase ist noch nicht konfiguriert.');
    const {data,error}=await this.client.auth.signInWithPassword({email,password});
    if(error)throw error;this.session=data.session;this.emit({message:'Account verbunden'});return data;
  }
  async signUp(email,password){
    if(!this.client)throw new Error('Supabase ist noch nicht konfiguriert.');
    const {data,error}=await this.client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
    if(error)throw error;this.session=data.session;this.emit({message:t(data.session?'cl.accountCreated':'cl.confirmSent')});return data;
  }
  async signOut(){if(!this.client)return;const{error}=await this.client.auth.signOut();if(error)throw error;this.session=null;this.emit({message:'Abgemeldet · lokaler Spielstand bleibt erhalten'});}
  async load(){
    if(!this.client||!this.session)return null;
    const{data,error}=await this.client.from('game_saves').select('save_data,updated_at,save_version').eq('user_id',this.session.user.id).maybeSingle();
    if(error)throw error;return data;
  }
  async save(saveData){
    if(!this.client||!this.session)return false;
    const{error}=await this.client.from('game_saves').upsert({user_id:this.session.user.id,save_data:saveData,save_version:1},{onConflict:'user_id'});
    if(error)throw error;this.emit({message:'Cloud-Spielstand aktuell',syncedAt:Date.now()});return true;
  }
  queueSave(saveData,delay=900){
    if(!this.session)return;
    this.pendingSave=structuredClone(saveData);clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(()=>{const data=this.pendingSave;this.pendingSave=null;this.save(data).catch((error)=>this.emit({error:error.message}));},delay);
  }
}

export const cloud=new CloudSave();
