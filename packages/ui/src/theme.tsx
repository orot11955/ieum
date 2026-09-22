import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export type ThemePreference = 'light' | 'dark' | 'system';
export const validPreference = (v:unknown):v is ThemePreference => v==='light'||v==='dark'||v==='system';
export const resolveTheme = (preference:ThemePreference, systemDark:boolean) => preference==='dark'||preference==='system'&&systemDark?'paper-dark':'paper-light';
const ThemeContext=createContext<{preference:ThemePreference;setPreference:(p:ThemePreference)=>void}>({preference:'system',setPreference:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}) {
  const [preference,setValue]=useState<ThemePreference>(()=>{try{const value=localStorage.getItem('ieum.theme');return validPreference(value)?value:'system';}catch{return 'system';}});
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const update=()=>{document.documentElement.dataset.ieumTheme=resolveTheme(preference,media.matches);};
    update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
  },[preference]);
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key==='ieum.theme')setValue(validPreference(event.newValue)?event.newValue:'system');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  return <ThemeContext.Provider value={{preference,setPreference:p=>{setValue(p);try{localStorage.setItem('ieum.theme',p);}catch{/* A blocked storage must not block theme selection. */}}}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
