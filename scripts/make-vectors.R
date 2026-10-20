# Generate reference-equation test vectors for PFT_Sim with rspiro.
#
# Run in a local R session from the repository root:  Rscript scripts/make-vectors.R
# Output: tests/vectors/rspiro-vectors.csv (derived numbers only; no coefficients or tables).
#
# BEFORE TRUSTING THE OUTPUT, check each call against the installed package documentation
# (?pred_GLI, ?pred_GLIgl, ?pred_NHANES3). The argument conventions below are written from memory
# of rspiro 0.5 and are the first thing to verify: height in METERS, gender 1 = male and
# 2 = female, and GLI-2012 ethnicity 1 = Caucasian, 2 = African American, 3 = North-East Asian,
# 4 = South-East Asian, 5 = Other/mixed. The script stops with a message if a function is missing.

suppressPackageStartupMessages(library(rspiro))
need <- c("pred_GLI", "LLN_GLI", "zscore_GLI", "pred_GLIgl", "LLN_GLIgl", "zscore_GLIgl")
missing <- need[!vapply(need, exists, logical(1))]
if (length(missing)) stop("rspiro is missing: ", paste(missing, collapse = ", "), ". Check the package version and the documentation.")

ages    <- c(5, 7.5, 8, 12, 12.25, 15, 18, 20, 25, 33.4, 40, 50, 61.75, 70, 80, 90)   # fractional ages test spline interpolation
heights <- c(1.10, 1.30, 1.50, 1.60, 1.70, 1.80, 1.90)          # meters
params  <- c("FEV1", "FVC", "FEV1FVC")
grid    <- expand.grid(age = ages, height = heights, gender = 1:2, param = params, stringsAsFactors = FALSE)
grid    <- grid[!(grid$age >= 18 & grid$height < 1.40) & !(grid$age < 12 & grid$height > 1.70), ]

rows <- list()
for (eth in 1:5) {                                              # GLI-2012, group-specific
  g <- grid
  g$equation <- "GLI2012"; g$ethnicity <- eth
  g$pred <- mapply(function(a, h, s, p) pred_GLI(a, h, s, eth, p), g$age, g$height, g$gender, g$param)
  g$lln  <- mapply(function(a, h, s, p) LLN_GLI(a, h, s, eth, p),  g$age, g$height, g$gender, g$param)
  g$z80  <- mapply(function(a, h, s, p, v) zscore_GLI(a, h, s, eth, p, v), g$age, g$height, g$gender, g$param, 0.8 * g$pred)
  rows[[length(rows) + 1]] <- g
}
g <- grid                                                       # GLI Global (2022), group-neutral
g$equation <- "GLIglobal"; g$ethnicity <- NA
g$pred <- mapply(function(a, h, s, p) pred_GLIgl(a, h, s, p), g$age, g$height, g$gender, g$param)
g$lln  <- mapply(function(a, h, s, p) LLN_GLIgl(a, h, s, p),  g$age, g$height, g$gender, g$param)
g$z80  <- mapply(function(a, h, s, p, v) zscore_GLIgl(a, h, s, p, v), g$age, g$height, g$gender, g$param, 0.8 * g$pred)
rows[[length(rows) + 1]] <- g

out <- do.call(rbind, rows)
out$height_cm <- round(out$height * 100)
out <- out[, c("equation", "ethnicity", "param", "gender", "age", "height_cm", "pred", "lln", "z80")]
dir.create("tests/vectors", recursive = TRUE, showWarnings = FALSE)
write.csv(out, "tests/vectors/rspiro-vectors.csv", row.names = FALSE)
writeLines(c(capture.output(sessionInfo()), paste("rspiro", as.character(packageVersion("rspiro")))), "tests/vectors/rspiro-sessioninfo.txt")
cat("wrote", nrow(out), "rows\n")
# NHANES III, GLI-2017 TLCO and GLI-2021 volumes: add blocks here once the matching rspiro
# functions (or another R source) are confirmed. Do not guess their signatures.
