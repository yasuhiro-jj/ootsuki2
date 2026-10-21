export const GPS_ACCURACY_WARNING_M = 50;

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Accuracy above 50m is a warning, not a rejection. Missing accuracy is also a warning. */
export function accuracyNeedsWarning(accuracyM: number | null | undefined): boolean {
  if (accuracyM == null) return true;
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return true;
  return accuracyM > GPS_ACCURACY_WARNING_M;
}
