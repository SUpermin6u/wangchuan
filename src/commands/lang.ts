/**
 * lang.ts — wangchuan lang command
 *
 * Display or switch CLI display language.
 */

import { getLang, setLang, t } from '../i18n.js';
import type { Lang } from '../i18n.js';
import { logger } from '../utils/logger.js';

export async function cmdLang(language?: string): Promise<void> {
  if (!language) {
    console.log(t('lang.current', { lang: getLang() }));
    return;
  }
  if (language !== 'zh' && language !== 'en') {
    throw new Error(t('lang.invalid'));
  }
  setLang(language as Lang);
  logger.ok(t('lang.switched', { lang: language }));
}
