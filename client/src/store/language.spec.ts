import Cookies from 'js-cookie';
import { DEFAULT_LANG, getDefaultLang } from './language';

describe('language defaults', () => {
  beforeEach(() => {
    localStorage.clear();
    Cookies.remove('lang');
  });

  it('uses Simplified Chinese when no language preference exists', () => {
    expect(DEFAULT_LANG).toBe('zh-Hans');
    expect(getDefaultLang()).toBe('zh-Hans');
  });

  it('prefers the saved cookie language', () => {
    Cookies.set('lang', 'fr-FR');

    expect(getDefaultLang()).toBe('fr-FR');
  });

  it('prefers local storage when no cookie language exists', () => {
    localStorage.setItem('lang', 'es-ES');

    expect(getDefaultLang()).toBe('es-ES');
  });
});
