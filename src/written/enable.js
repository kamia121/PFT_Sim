/**
 * The written-impression check is an experimental prototype and is OFF by default. It runs only when the address carries `written=1`, read once at boot
 * (the page rewrites its own address as the case changes, and the switch is deliberately not copied into shared case links).
 * With the switch off nothing of this feature is loaded, no label changes, and no text is read.
 */
export const writtenEnabled = (search) => new URLSearchParams(String(search ?? '')).get('written') === '1';
