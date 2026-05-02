import { compactBadgeText, sanitizeBadgeText } from './format';
import { fitTextWithEllipsis, measureTextWidth, type MeasureTextOptions } from './fit';
import type { BadgeType } from './types';

const METRIC_SEPARATOR = ' · ';

const LABEL_FONT: MeasureTextOptions = { fontSize: 15, fontWeight: 700, letterSpacing: 1.2 };
const VALUE_FONT: MeasureTextOptions = { fontSize: 24, fontWeight: 800 };
const SECONDARY_FONT: MeasureTextOptions = { fontSize: 14, fontWeight: 700 };
const WATERMARK_FONT: MeasureTextOptions = { fontSize: 10, fontWeight: 500, letterSpacing: 0.8 };

export interface BadgeLayoutConstraint {
  minWidth: number;
  maxWidth: number;
  height: number;
  outerPaddingRight: number;
  contentStartX: number;
  contentRightPadding: number;
  watermarkLeftPadding: number;
  minContentWidth: number;
  iconBoxX: number;
  iconBoxY: number;
  iconBoxWidth: number;
  iconBoxHeight: number;
  labelY: number;
  valueY: number;
  secondaryY: number;
  watermarkY: number;
  barY: number;
}

export const BADGE_LAYOUT_DEFAULTS: BadgeLayoutConstraint = {
  minWidth: 150,
  maxWidth: 300,
  height: 96,
  outerPaddingRight: 10,
  contentStartX: 118,
  contentRightPadding: 14,
  watermarkLeftPadding: 8,
  minContentWidth: 48,
  iconBoxX: 10,
  iconBoxY: 10,
  iconBoxWidth: 96,
  iconBoxHeight: 76,
  labelY: 39,
  valueY: 68,
  secondaryY: 67,
  watermarkY: 91,
  barY: 76,
};

const BADGE_CONSTRAINT_OVERRIDES: Partial<Record<BadgeType, Partial<BadgeLayoutConstraint>>> = {
  summary: { maxWidth: 340 },
  leaderboard: { maxWidth: 260 },
  tokens: { maxWidth: 240 },
  tokens30d: { maxWidth: 240 },
  models: { maxWidth: 250 },
  'primary-model': { maxWidth: 220 },
};

export interface ComputeBadgeLayoutInput {
  badgeType?: BadgeType;
  icon: string;
  label: string;
  value: string;
  secondaryText?: string;
  watermark: string;
  minWidth?: number;
  maxWidth?: number;
}

export interface ComputedBadgeLayout {
  badgeType: BadgeType;
  constraint: BadgeLayoutConstraint;
  width: number;
  height: number;
  icon: string;
  label: string;
  value: string;
  secondaryText: string;
  labelWidth: number;
  valueWidth: number;
  secondaryWidth: number;
  availableLabelWidth: number;
  availableValueWidth: number;
  availableSecondaryWidth: number;
  separatorWidth: number;
  valueX: number;
  secondaryX: number;
  labelX: number;
  watermark: string;
  watermarkWidth: number;
  watermarkX: number;
  watermarkEndX: number;
  barX: number;
  barWidth: number;
  barFillWidth: number;
}

export function clampBadgeWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

function resolveConstraint(badgeType: BadgeType, minWidth?: number, maxWidth?: number): BadgeLayoutConstraint {
  const override = BADGE_CONSTRAINT_OVERRIDES[badgeType] ?? {};
  const merged: BadgeLayoutConstraint = {
    ...BADGE_LAYOUT_DEFAULTS,
    ...override,
  };

  if (typeof minWidth === 'number') {
    merged.minWidth = Math.max(80, Math.round(minWidth));
  }

  if (typeof maxWidth === 'number') {
    merged.maxWidth = Math.max(merged.minWidth, Math.round(maxWidth));
  }

  return merged;
}

export function computeBadgeLayout({
  badgeType = 'generic',
  icon,
  label,
  value,
  secondaryText = '',
  watermark,
  minWidth,
  maxWidth,
}: ComputeBadgeLayoutInput): ComputedBadgeLayout {
  const constraint = resolveConstraint(badgeType, minWidth, maxWidth);

  const compacted = compactBadgeText({
    badgeType,
    value,
    secondaryText,
  });

  const normalizedLabel = sanitizeBadgeText(label).toUpperCase();
  const normalizedValue = sanitizeBadgeText(compacted.value).toUpperCase();
  const normalizedSecondary = sanitizeBadgeText(compacted.secondaryText).toUpperCase();
  const normalizedWatermark = sanitizeBadgeText(watermark);

  const separatorWidth = normalizedSecondary ? measureTextWidth(METRIC_SEPARATOR, SECONDARY_FONT) : 0;

  const labelWidthRaw = measureTextWidth(normalizedLabel, LABEL_FONT);
  const valueWidthRaw = measureTextWidth(normalizedValue, VALUE_FONT);
  const secondaryWidthRaw = normalizedSecondary ? measureTextWidth(normalizedSecondary, SECONDARY_FONT) : 0;
  const watermarkWidth = measureTextWidth(normalizedWatermark, WATERMARK_FONT);

  const desiredContentWidth = Math.max(
    constraint.minContentWidth,
    labelWidthRaw,
    valueWidthRaw + (normalizedSecondary ? separatorWidth + secondaryWidthRaw : 0)
  );

  const desiredWidth =
    constraint.contentStartX + desiredContentWidth + constraint.contentRightPadding + constraint.outerPaddingRight;

  const watermarkRequiredWidth = watermarkWidth + constraint.outerPaddingRight + constraint.watermarkLeftPadding;

  const width = clampBadgeWidth(
    Math.max(desiredWidth, watermarkRequiredWidth),
    constraint.minWidth,
    constraint.maxWidth
  );

  const availableLineWidth = Math.max(
    0,
    width - constraint.contentStartX - constraint.contentRightPadding
  );

  const fittedLabel = fitTextWithEllipsis(normalizedLabel, availableLineWidth, LABEL_FONT);

  let fittedValue = normalizedValue;
  let fittedSecondary = normalizedSecondary;

  let fittedValueWidth = measureTextWidth(fittedValue, VALUE_FONT);
  let fittedSecondaryWidth = fittedSecondary ? measureTextWidth(fittedSecondary, SECONDARY_FONT) : 0;

  if (fittedSecondary) {
    if (fittedValueWidth >= availableLineWidth) {
      fittedSecondary = '';
      fittedSecondaryWidth = 0;
      fittedValue = fitTextWithEllipsis(fittedValue, availableLineWidth, VALUE_FONT);
      fittedValueWidth = measureTextWidth(fittedValue, VALUE_FONT);
    } else {
      const secondaryTargetWidth = Math.max(0, availableLineWidth - fittedValueWidth - separatorWidth);
      fittedSecondary = fitTextWithEllipsis(fittedSecondary, secondaryTargetWidth, SECONDARY_FONT);
      fittedSecondaryWidth = fittedSecondary ? measureTextWidth(fittedSecondary, SECONDARY_FONT) : 0;

      const combinedWidth = fittedValueWidth + (fittedSecondary ? separatorWidth + fittedSecondaryWidth : 0);
      if (combinedWidth > availableLineWidth) {
        fittedSecondary = '';
        fittedSecondaryWidth = 0;
      }

      if (fittedValueWidth > availableLineWidth) {
        fittedValue = fitTextWithEllipsis(fittedValue, availableLineWidth, VALUE_FONT);
        fittedValueWidth = measureTextWidth(fittedValue, VALUE_FONT);
      }
    }
  } else if (fittedValueWidth > availableLineWidth) {
    fittedValue = fitTextWithEllipsis(fittedValue, availableLineWidth, VALUE_FONT);
    fittedValueWidth = measureTextWidth(fittedValue, VALUE_FONT);
  }

  const finalSeparatorWidth = fittedSecondary ? separatorWidth : 0;
  const availableSecondaryWidth = fittedSecondary
    ? Math.max(0, availableLineWidth - fittedValueWidth - finalSeparatorWidth)
    : 0;

  const barWidth = Math.max(20, availableLineWidth);
  const barFillWidth = Math.min(barWidth, Math.max(16, Math.round(barWidth * 0.4)));

  const watermarkEndX = width - constraint.outerPaddingRight;
  const watermarkX = Math.max(0, watermarkEndX - watermarkWidth);

  return {
    badgeType,
    constraint,
    width,
    height: constraint.height,
    icon,
    label: fittedLabel,
    value: fittedValue,
    secondaryText: fittedSecondary,
    labelWidth: measureTextWidth(fittedLabel, LABEL_FONT),
    valueWidth: fittedValueWidth,
    secondaryWidth: fittedSecondaryWidth,
    availableLabelWidth: availableLineWidth,
    availableValueWidth: availableLineWidth,
    availableSecondaryWidth,
    separatorWidth: finalSeparatorWidth,
    valueX: constraint.contentStartX,
    secondaryX: constraint.contentStartX + fittedValueWidth + finalSeparatorWidth,
    labelX: constraint.contentStartX,
    watermark: normalizedWatermark,
    watermarkWidth,
    watermarkX,
    watermarkEndX,
    barX: constraint.contentStartX,
    barWidth,
    barFillWidth,
  };
}
