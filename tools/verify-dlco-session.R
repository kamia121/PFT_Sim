# Independent arithmetic fixtures; no JS implementation or GLI tables are read.
close <- function(x,y) stopifnot(abs(x-y) < 1e-12)
# Repeatable A pool, with a rejected/outlier result left out.
a <- c(20,22); stopifnot(diff(range(a)) <= 2); close(mean(a),21)
stopifnot(diff(range(c(20,22.000001))) > 2)
# B/C/D fallback is averaged only after no A remains; F=99 is excluded.
close(mean(c(10,12,14)),12)
# Same selected pool for reported VA and derived KCO; distinct from mean individual KCO.
va <- c(4.8,5.2); close(mean(va),5); close(mean(a)/mean(va),4.2)
# Alternative acceptance uses the OTHER VA, with the greater absolute/fractional allowance.
stopifnot(abs(5.25-5) <= max(.2,.05*5)); stopifnot(abs(5.250001-5) > max(.2,.05*5))
# Source prints .67 SI separately, so it is tested in its own units.
close(diff(range(c(2,2.67))),.67)
cat('PASS: A-only mean 21; B-D mean 12 excluding F; matched mean VA 5 and derived KCO 4.2; other-VA boundary; separate SI threshold.\n')
cat('Arithmetic fixtures only; this does not validate waveform recognition, reference equations or official calculator outputs.\n')

# Jones–Meade Figure 5: independently specified time endpoints, not volume fractions.
t0 <- .2; t90 <- 2.2; sample <- c(10,13)
close(t0+.3*(t90-t0),.8); close(mean(sample),11.5)
close(mean(sample)-(t0+.3*(t90-t0)),10.7)
# Polynomial inspiration: derivative maximum at 1/3, tangent intercept x-F/Fprime.
f <- function(x) 6*x^2-8*x^3+3*x^4
fp <- function(x) 12*x-24*x^2+12*x^3
zero <- 1/3-f(1/3)/fp(1/3); close(zero,5/48)
x90 <- uniroot(function(x) f(x)-.9,c(.5,.9),tol=1e-14)$root
close(zero+.3*(x90-zero),.27677849155012116)
cat('PASS: independent Jones–Meade 10.7-second fixture and analytic nonlinear inspiration tangent/root.\n')
