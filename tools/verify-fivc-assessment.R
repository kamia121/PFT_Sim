# Independent, explicitly synthetic arithmetic fixtures for Graham 2019 Table 7.
# These do not validate inspiratory waveform generation or clinical measurement recognition.
limit <- function(fvc) max(.100, .05*fvc)
stopifnot(limit(1)==.100, limit(4)==.200)
# Decimal boundary differences may exceed the nominal limit by machine precision only.
stopifnot(abs((1.1-1)-.100) < 1e-14)
stopifnot(abs((4.2-4)-.200) < 1e-14)
stopifnot(4.200000001-4 > limit(4), 1.100000001-1 > limit(1))
# One-sided comparison: a lower FIVC is not an excess-FIVC failure.
stopifnot(3-4 < limit(4))
# The separately reported FIVC uses all confirmed observations, not the FVC-selected pool.
stopifnot(max(c(4.1,4.7))==4.7)
cat('PASS: absolute/fractional limits, decimal equality, just-above failures, one-sided difference and largest recorded FIVC.\n')
