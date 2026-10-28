# Exact coefficient sources and what is still needed

This request is narrower than “send the papers.” The original printed tables check the coefficient transcription. The spline lookup files check age-dependent terms. Both are needed for a complete source audit. Independent official outputs check end-to-end units, equation version, interpolation and limits; a few examples do not verify every coefficient or spline row.

## GLI-2021 static lung volumes

Hall GL, Filipow N, Ruppel G, Okitika T, Thompson B, Kirkby J, Steenbruggen I, Cooper BG, Stanojevic S; contributing GLI Network members. **Official ERS technical standard: Global Lung Function Initiative reference values for static lung volumes in individuals of European ancestry.** *European Respiratory Journal*. 2021;57(3):2000289. Published 11 March 2021. DOI: [10.1183/13993003.00289-2020](https://doi.org/10.1183/13993003.00289-2020). [PubMed](https://pubmed.ncbi.nlm.nih.gov/33707167/).

* Needed for independent visual transcription: **Table 3, PDF page 5**, including all coefficient columns and footnotes; plus the supplementary worked example.
* [Original publisher PDF](https://publications.ersnet.org/content/erj/57/3/2000289.full.pdf): local web fetch returned HTTP403.
* [Original volume spline workbook](https://publications.ersnet.org/content/erj/57/3/2000289/DC1/embed/inline-supplementary-material-2.xlsx): **already present** in the local packet; no need to request again. A fresh live download was not obtained by this turn.

## GLI-2017 gas transfer, corrected 2020

Stanojevic S et al. **Official ERS technical standards: Global Lung Function Initiative reference values for the carbon monoxide transfer factor for Caucasians.** *European Respiratory Journal*. 2017;50(3):1700010. DOI: [10.1183/13993003.00010-2017](https://doi.org/10.1183/13993003.00010-2017). [PubMed](https://pubmed.ncbi.nlm.nih.gov/28893868/).

Author correction to that article: *European Respiratory Journal*. 2020;56(4):1750010, 15 October 2020. DOI: [10.1183/13993003.50010-2017](https://doi.org/10.1183/13993003.50010-2017). [PubMed](https://pubmed.ncbi.nlm.nih.gov/33060163/). The official calculator notice is dated **25 September 2020**; that notice date is distinct from the correction's journal-publication date.

* Needed: **corrected Table 2, PDF page 2**, both sexes, traditional and SI forms, and its footnotes. Original-2017 Table 2 alone is insufficient.
* [Correction PDF](https://publications.ersnet.org/content/erj/56/4/1750010.full.pdf) and [correction DOI route](https://publications.ersnet.org/lookup/doi/10.1183/13993003.50010-2017): local fetches returned HTTP403.
* Corrected [SI workbook](https://publications.ersnet.org/content/erj/50/3/1700010/DC1/embed/inline-supplementary-material-2.xlsx) and [traditional workbook](https://publications.ersnet.org/content/erj/50/3/1700010/DC1/embed/inline-supplementary-material-3.xlsx): **both already present** in the local packet. Their age rows run 5–90; this does not settle the recommended range (original abstract/current calculator 5–85 versus correction cohort description 5–80).
* The **2018 DLCO measurement-standard erratum**, DOI [10.1183/13993003.50016-2016](https://doi.org/10.1183/13993003.50016-2016), corrects different measurement equations and is not this 2020 reference-equation correction. Its detailed application to the synthetic tracing model remains open.

## GLI Global race-neutral spirometry

Bowerman C, Bhakta NR, Brazzale D, et al. **A Race-neutral Approach to the Interpretation of Lung Function Measurements.** *American Journal of Respiratory and Critical Care Medicine*. 2023;207(6):768–774. Published 15 March 2023. DOI: [10.1164/rccm.202205-0963OC](https://doi.org/10.1164/rccm.202205-0963OC). [PubMed](https://pubmed.ncbi.nlm.nih.gov/36383197/).

* Needed: original supplementary **Table E3**, `bowerman_data_supplement.pdf`, and **gli_global_lookuptables_dec6.xlsx**.
* [Original article/supplement entry](https://academic.oup.com/ajrccm/article/207/6/768/8428176): local tool encountered an inaccessible publisher redirect. Exact currently working attachment URLs were not independently recovered.
* Repository-recorded historical [workbook URL](https://oup.silverchair-cdn.com/oup/backfile/Content_public/Journal/ajrccm/207/6/10.1164_rccm.202205-0963OC/1/gli_global_lookuptables_dec6.xlsx); its recorded hash is in `src/reference/sources.json`. This link is provenance, not a claim that a fresh retrieval succeeded.

## GLI-2012 spirometry

Quanjer PH et al. **Multi-ethnic reference values for spirometry for the 3–95-yr age range: the global lung function 2012 equations.** *European Respiratory Journal*. 2012;40(6):1324–1343. DOI: [10.1183/09031936.00080312](https://doi.org/10.1183/09031936.00080312). [Original PMC article](https://pmc.ncbi.nlm.nih.gov/articles/PMC3786581/).

* [Original supplementary coefficient/method PDF](https://pmc.ncbi.nlm.nih.gov/articles/instance/3786581/bin/NIHMS513963-supplement-Supplementary_data.pdf), especially supplement section2; [publisher lookup workbook](https://publications.ersnet.org/content/erj/suppl/2013/04/19/09031936.00080312.DC1/lookuptables.xls). Repository data and rspiro agreement exist; complete fresh original coefficient/spline provenance inspection remains open.

## What the local packet and rerun prove

The read-only archive `/Users/kurthu/Documents/GLI_primary_verification_packet.zip` contains Hall's workbook and both corrected TLCO workbooks, plus a provenance file and a prior transcription. It contains **no printed-table PDFs**. Its provenance records retrieval on **20 October 2026**, publisher URLs and hashes. This turn extracted those files and independently recomputed their hashes on **24 October 2026**; it did not freshly retrieve them from the publisher or independently authenticate the provenance record.

The stored volume/TLCO spline arrays exactly match the corresponding archived workbook rows. The coefficients exactly match the **same prior transcription** used by `tools/verify-gli-primary.py`. This proves consistency with that transcription; it cannot detect a shared transcription error or substitute for reading the original corrected printed tables. Log, tolerances and hashes: `gli-workbook-rerun-2026-10-24.txt` and `rule-source-audit.md`.

## Official-output route and current technical blocker

Use [the official GLI calculator](https://gli-calculator.ersnet.org/) and [its documentation](https://gli-calculator.ersnet.org/docs.html). User approval to solve CAPTCHA was received. Chrome normal-form attempt used synthetic age40, height170cm, male reference input, race-neutral spirometry; FEV1=3L, FVC=4L; traditional TLCO=20mL/min/mmHg, VA=5L, KCO=4mL/min/mmHg/L, standard-pressure correction selected; FRC=3L, TLC=6L, RV=2L, ERV=1L, IC=3L, VC=4L. These are **attempted inputs, not validation fixtures**.

The form rejected submission with `general_error: no recaptcha supplied. please complete the recaptcha check`. After a normal reload the widget displayed **“This site is exceeding reCAPTCHA Enterprise free quota.”** The authorized checkbox briefly disabled, then returned unchecked, with no challenge/token or numerical result. An accessibility click and a direct click on the visible checkbox had the same outcome. No security bypass or API-key acquisition was attempted. Output precision and equation-output versions cannot be recorded because no outputs were returned. Page footer displayed Global Lung Function Initiative2021, Version2.0; this is a website version label, not evidence that a specific computed result used the corrected equation.

Useful assistance is an official CSV/Excel export once the service works, with input sex/age/height/group, raw values and units, pressure correction setting, equation identity/version, date and displayed precision preserved. Representative male/female, off-grid age, age-boundary, low/high and near-limit cases are needed. Do not fill missing outputs with guesses.
