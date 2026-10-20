/**
 * Teaching text for the reveal. Each paragraph opens on physiology and carries no case values;
 * values belong in the tables. Statements that rest on rules not yet checked against the primary
 * statement are phrased as the convention this tool applies.
 */

export const PATTERN_TEXT = {
  normal: [
    'FEV₁, FVC and the FEV₁/FVC ratio are interpreted against the lower limit of normal, the z-score of −1.645 that marks the fifth percentile of a healthy reference population. A z-score above that limit is within the reference range even when the percent predicted looks low, which is why percent predicted is shown but never used to classify.',
    'Normal spirometry does not exclude a restrictive process or a gas-transfer defect. When lung volumes and diffusing capacity were measured they are read on their own z-scores. Because several correlated measurements are compared with a limit that 5% of healthy people fall below, an isolated value just under a limit in an otherwise normal report carries little weight.',
  ],
  obstruction: [
    'Airflow obstruction is present when the FEV₁/FVC ratio falls below its lower limit of normal. The ratio is used because the airways narrow or lose recoil and the first second of a forced expiration empties a smaller share of the vital capacity. A fixed ratio of 0.70 is not used here, because the lower limit changes with age, sex and height and a fixed value misclassifies older and younger people in opposite directions.',
    'Severity is graded from the FEV₁ z-score, not from the ratio. A normal TLC with RV or RV/TLC above its upper limit indicates air trapping, and a TLC above its upper limit indicates hyperinflation; the TLC method matters, because gas dilution underestimates TLC where ventilation is uneven.',
  ],
  'obstruction-low-fvc': [
    'A low FEV₁/FVC ratio with a low FVC shows obstruction, but a low FVC can also arise from air trapping that prevents full emptying, or from coexisting restriction. Spirometry alone cannot separate these. Lung volumes are required: a low TLC identifies mixed disease, and a preserved or raised TLC with a raised RV identifies obstruction with air trapping.',
  ],
  restriction: [
    'Restriction is defined by a TLC below its lower limit of normal. It means the lungs hold less gas at full inflation, because the parenchyma is stiff, the chest wall or respiratory muscles limit expansion, or lung tissue has been lost. A low FVC with a preserved FEV₁/FVC ratio predicts restriction but does not establish it.',
    'The diffusing capacity, KCO and VA separate the causes. In parenchymal disease the DLCO is reduced and the KCO is normal or low. When the chest wall or the respiratory muscles limit expansion, the lung itself is intact, the alveolar volume is small, and the KCO is raised because the same gas-transfer surface is concentrated in a smaller volume.',
  ],
  mixed: [
    'Mixed disease combines a ratio below the lower limit with a TLC below the lower limit. The FVC is low from restriction and from air trapping together, so a low FVC alone cannot be assigned to either process; both the ratio and the TLC are needed. This tool does not grade severity for mixed disease, because the grading rule for it has not been checked against the 2022 statement.',
  ],
  nonspecific: [
    'A low FVC or FEV₁ with a preserved ratio and a TLC that is not low is a nonspecific pattern. The vital capacity is reduced although the lungs hold a normal amount of gas at full inflation, so the residual volume is relatively high: expiration stops early, from air trapping without airflow obstruction by the ratio, from poor effort, or from a process that is not yet classifiable.',
    'The same spirometric finding, reported when no lung volumes were measured, is called preserved ratio with impaired spirometry (PRISm). The label describes spirometry only; some people with this finding have restriction when TLC is measured.',
  ],
  prism: [
    'A preserved FEV₁/FVC ratio with a low FVC or FEV₁ and no lung volumes cannot be classified further. Restriction is possible but unproven, because a low FVC can also reflect incomplete expiration. Lung volumes by plethysmography or gas dilution are the next test.',
  ],
  indeterminate: ['No maneuver was usable, so no FEV₁ or FVC can be reported and no interpretation is possible. A report with this quality result should be repeated, not interpreted.'],
};

export const DLCO_TEXT = {
  reduced: 'The diffusing capacity reflects the surface area and thickness of the alveolar-capillary membrane and the pulmonary capillary blood volume, scaled to hemoglobin. A reduced DLCO after hemoglobin correction indicates loss of gas-exchanging surface, thickened membrane, or reduced capillary blood volume.',
  normal: 'The hemoglobin-adjusted DLCO is within the reference range.',
  raised: 'A DLCO above the upper limit can reflect increased pulmonary capillary blood volume, for example in left-to-right shunting or after recent exercise. A high hemoglobin concentration raises the measured value, which the adjustment removes.',
  subtype: {
    'low-kco-preserved-va': 'The KCO is reduced while the alveolar volume is preserved: the gas-transfer defect is intrinsic to the lung, as in emphysema, interstitial disease or pulmonary vascular disease.',
    'low-va-high-kco': 'The alveolar volume is reduced and the KCO is raised. The lung is incompletely expanded or reduced in volume but its gas-exchanging tissue is structurally intact, as in chest wall or neuromuscular restriction.',
    'low-va-normal-kco': 'The alveolar volume is reduced and the KCO is within the reference range. Because KCO normally rises as alveolar volume falls with incomplete expansion, a KCO that stays in the normal range at a low volume points to a coexisting intrinsic defect.',
    'both-low': 'Both the alveolar volume and the KCO are reduced, which implies volume loss together with an intrinsic gas-transfer defect.',
    'low-dlco-only': 'The DLCO is reduced although the alveolar volume and KCO are individually within their ranges; the defect is mild or borderline in both components.',
    'normal-kco-at-low-va': 'The DLCO is normal, but the KCO is not raised as expected for the reduced alveolar volume, which can indicate a mild coexisting intrinsic defect.',
  },
  unadjusted: 'No hemoglobin was available, so the measured DLCO is classified without adjustment. A low hemoglobin concentration lowers the measured DLCO and KCO and a high one raises them, independently of the lung, so an abnormal value cannot be attributed to the lung until the hemoglobin is known.',
  hb: 'DLCO falls with hemoglobin concentration because carbon monoxide binds hemoglobin. The measured value is therefore adjusted to a standard hemoglobin before it is compared with the reference. An anemic patient can have a low measured DLCO and a normal adjusted value, and the adjusted value is the one interpreted.',
};

export const BD_TEXT = {
  rules: 'The 2022 ERS/ATS statement expresses the bronchodilator change in FEV₁ or FVC as a percentage of the predicted value, with more than 10% of predicted regarded as a significant response. The earlier criterion expressed the change as a percentage of the baseline value and required at least 12% and at least 200 mL. The two rules disagree in both directions: a patient with a low baseline can meet the earlier rule with a change smaller than 10% of predicted, and a patient with a baseline near normal can meet the 2022 rule while falling short of 12% of baseline. Because the 2022 rule uses the predicted value, the result also depends on the reference equation.',
  volume: 'A rise in FVC with little change in FEV₁ is a volume response. A bronchodilator opens airways that were closing early, so more gas can be expelled before expiration stops. It occurs with air trapping and does not require the ratio to normalize.',
  artifact: 'In this case the FVC after the bronchodilator is lower than before while the FEV₁ is higher. A shorter forced expiratory time lowers the FVC and makes the FEV₁/FVC ratio look better than the lung is. The maneuver table shows the expiratory times; the apparent change in the ratio is a technique effect.',
  artifactFev1Fell: 'In this case the FEV₁ after the bronchodilator is lower than before while the FVC is higher. A weaker or later first-second effort lowers the FEV₁, and a longer expiration raises the FVC, so the ratio falls without a lasting change in the airways; induced airway narrowing is also possible. The maneuver table shows the expiratory times and the comments record the faults.',
};

/** The bronchodilator artifact paragraph that matches the direction of the discordant change. */
export const bdArtifactText = (bd) => (bd && bd.dFev1 < 0 && bd.dFvc > 0 ? BD_TEXT.artifactFev1Fell : BD_TEXT.artifact);

/** Replacement notes for archetype descriptions whose wording goes beyond what the project's sources establish. */
export const ARCHETYPE_NOTE_OVERRIDES = {
  'obesity-low-erv': 'Obesity with low expiratory reserve volume and FRC, and a normal or mildly low TLC.',
};

export const GRADE_TEXT = {
  A: 'Three or more acceptable maneuvers, the two largest within 0.150 L.',
  B: 'Two acceptable maneuvers within 0.150 L.',
  C: 'Two or more acceptable maneuvers within 0.200 L.',
  D: 'Two or more acceptable maneuvers within 0.250 L.',
  E: 'Two or more acceptable maneuvers more than 0.250 L apart, or only one acceptable maneuver.',
  U: 'No acceptable maneuver; at least one usable.',
  F: 'No acceptable and no usable maneuver.',
};

export const ANCHOR_TEXT = 'This case was generated around the GLI Global equations for spirometry, the GLI-2021 equations for lung volumes and the GLI-2017 equations for diffusing capacity, using the European or group-neutral versions. A value that is normal for those equations can fall just below the lower limit under another equation. That shift, not a change in the lungs, is what the equation comparison shows.';

export const LOW_ERV_TEXT = 'A reduced expiratory reserve volume lowers FRC, because FRC is the sum of RV and ERV. Obesity is the usual cause: the chest wall load pushes FRC toward RV. It is a finding that qualifies a report and does not by itself define a pattern. In obesity the FVC is often mildly reduced; the effect of obesity on the DLCO and KCO is small and variable, and this tool does not use it to classify.';
