import {describe,it,expect} from 'vitest';
import {validPreference,resolveTheme} from '../../packages/ui/src/theme';
describe('theme preference',()=>{
 it('resolves explicit preferences independently of the OS',()=>{expect(resolveTheme('dark',false)).toBe('paper-dark');expect(resolveTheme('light',true)).toBe('paper-light');});
 it('follows the OS only for system mode',()=>{expect(resolveTheme('system',true)).toBe('paper-dark');expect(resolveTheme('system',false)).toBe('paper-light');});
 it('rejects arbitrary values from persistent storage',()=>{expect(validPreference(null)).toBe(false);expect(validPreference('pink')).toBe(false);expect(validPreference('system')).toBe(true);});
});
