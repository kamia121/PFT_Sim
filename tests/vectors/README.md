# rspiro test vectors

`rspiro-vectors.csv` holds predicted values, lower limits of normal and z-scores produced by `scripts/make-vectors.R` with rspiro 0.5 on R 4.6.1 (see `rspiro-sessioninfo.txt`). It contains derived numbers only, no coefficients or lookup tables. `rspiro-validation.txt` is the physician's check of the rows against vectorized package calls: maximum absolute differences were about 5e-15, predicted values have z = 0, and the package places the lower limit at z = -1.645 (the rounded cutoff).

Columns: `equation` (GLI2012 or GLIglobal), `ethnicity` (GLI-2012 code 1 to 5; NA for GLI Global), `param` (FEV1, FVC, FEV1FVC), `gender` (1 male, 2 female), `age` in years, `height_cm`, `pred` and `lln` in liters (ratio for FEV1FVC), and `z80`, the z-score of a measured value equal to 80% of `pred`.

These vectors can check a port of the GLI tables but cannot create one. The reference module that reads them is not written yet because the GLI lookup tables have not been supplied.
