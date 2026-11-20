// @ts-nocheck — every import below resolves in lotus-mobile, not in this repo.
/**
 * Dumps the mobile app's onboarding screens (text shown, type, options) and the
 * titles of its programme goals to JSON, for the dashboard's Onboarding page
 * (lib/onboarding-journal/catalog.json).
 *
 * This file is NOT a dashboard test: it runs inside a lotus-mobile checkout,
 * under that repo's Jest setup, because the screens are built by the app's own
 * flow builders. `scripts/generate-onboarding-catalog.mjs` copies it there,
 * runs it and removes it — see that script.
 */

(globalThis as any).__DEV__ = true;
jest.mock('../../i18n', () => require('../../test-utils/i18nMock'));
// troncCommunFin.ts reads Platform.OS: iOS has one more screen (home widgets).
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
// branches/universal.ts imports constants/theme, which pulls in react-native.
jest.mock('../../constants/theme', () => ({ ONBOARDING: { autoAdvanceDelay: 350 } }));

import * as fs from 'fs';
import type { OnboardingBranch, OnboardingStep } from '../../types/onboarding';
import { flareVariantFor, linksVariantFor } from '../../components/onboarding/showcaseRouting';
import '../branches/universal';
import '../branches/final';
import { buildDefaultFlow, buildFlow } from '../flowConfig';

const i18n = require('../../test-utils/i18nMock').default;
const fr = (key: string): string => {
  const text = i18n.getFixedT('fr')(key);
  return text === key ? '' : text;
};

const BRANCHES: OnboardingBranch[] = [
  'endoDiagnosed',
  'adenoDiagnosed',
  'endoAdeno',
  'endoSuspected',
  'cycleSuivi',
  'sopkDiagnosed',
  'sopkEndo',
  'babyProject',
  'fibroDiagnosed',
  'menopauseV4',
  'menopauseEndo',
  'congestionPelvienne',
];

/**
 * A product-tour step shows a scene picked from its `tourScreenId` (and, for
 * two of them, from the parcours): the step's own question is a leftover that
 * is no longer displayed. Mirrors ProductTourStep / showcaseRouting.
 */
function tourTitleKey(tourScreenId: string, branch?: OnboardingBranch): string | undefined {
  switch (tourScreenId) {
    case 'welcome':
      return 'onboarding.showcase.welcomeHome.title';
    case 'mealAnalysis':
      return 'onboarding.showcase.inflammationScore.title';
    case 'experts':
      return 'onboarding.showcase.expertsChat.title';
    case 'symptomTrends':
      return 'onboarding.showcase.symptomTrends.title';
    case 'medicalSupport':
      return `onboarding.showcase.flareLog.variants.${flareVariantFor(branch)}.title`;
    case 'longTermLinks':
      return `onboarding.showcase.longTermLinks.variants.${linksVariantFor(branch)}.title`;
    case 'homeWidgets':
      return 'onboarding.homeWidgets.title';
    default:
      return undefined;
  }
}

/** Screens without a question of their own: the title shown on the screen. */
const TYPE_TITLE_KEYS: Record<string, string> = {
  preNotification: 'onboarding.notifications.title',
  healthPermission: 'onboarding.healthPermission.title',
};

interface CatalogOption {
  value: string;
  label: string;
}
interface CatalogStep {
  type: string;
  title: string;
  saveTo: string;
  maxSelections?: number;
  options?: CatalogOption[];
}

// One line, and the first-name placeholder ({firstName}, {prenom}, {{name}}) made readable.
const clean = (text: string | undefined): string =>
  (text ?? '')
    .replace(/\{+\s*(firstName|prenom|name)\s*\}+/g, '[prénom]')
    .replace(/\s+/g, ' ')
    .trim();

function titleOf(step: OnboardingStep, branch?: OnboardingBranch): string {
  if (step.type === 'productTour' && step.tourScreenId) {
    const key = tourTitleKey(step.tourScreenId, branch);
    const title = key ? clean(fr(key)) : '';
    if (title) return title;
  }
  return clean(step.questionFr) || clean(fr(TYPE_TITLE_KEYS[step.type] ?? ''));
}

test('dump the onboarding catalog', () => {
  const out = process.env.ONBOARDING_CATALOG_OUT;
  if (!out) throw new Error('ONBOARDING_CATALOG_OUT is not set');

  const steps: Record<string, CatalogStep> = {};
  const flows: Array<{ branch?: OnboardingBranch; steps: OnboardingStep[] }> = [
    { steps: buildDefaultFlow() },
    ...BRANCHES.map((branch) => ({ branch, steps: buildFlow(branch) })),
  ];

  for (const flow of flows) {
    for (const step of flow.steps) {
      const entry = (steps[step.id] ??= {
        type: step.type,
        title: titleOf(step, flow.branch),
        saveTo: step.saveTo,
        ...(step.maxSelections !== undefined ? { maxSelections: step.maxSelections } : {}),
      });
      // A screen shared by several parcours keeps the title of the first one
      // that has it. Its options can differ from one parcours to the next:
      // keep them all, the first label seen wins.
      for (const option of step.options ?? []) {
        const options = (entry.options ??= []);
        if (!options.some((known) => known.value === option.dataValue)) {
          options.push({ value: option.dataValue, label: clean(option.labelFr) });
        }
      }
    }
  }

  // Goals of the programme screen: its events only carry their template id.
  const goals: Record<string, string> = require('../../locales/fr.json').goals.templates;

  // Checked before writing: a run that found nothing must not replace the catalog.
  expect(Object.keys(steps).length).toBeGreaterThan(50);
  expect(Object.keys(goals).length).toBeGreaterThan(0);
  fs.writeFileSync(out, `${JSON.stringify({ steps, goals }, null, 1)}\n`);
});
