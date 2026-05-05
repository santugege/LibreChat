import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';
import { DEFAULT_LANG } from '~/constants/branding';

const getDefaultLang = () => Cookies.get('lang') || localStorage.getItem('lang') || DEFAULT_LANG;

const lang = atomWithLocalStorage('lang', getDefaultLang());

export default { lang };
export { DEFAULT_LANG, getDefaultLang };
