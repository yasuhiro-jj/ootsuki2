export function shouldUseSecureCookie({
  host,
  protocol,
}: {
  host?: string | null;
  protocol?: string | null;
} = {}) {
  if (process.env.NODE_ENV !== "production") return false;

  const hostname = host?.split(":")[0]?.trim().toLowerCase();
  if (!hostname || isLocalHost(hostname) || isPrivateIpv4(hostname)) {
    return false;
  }

  const normalizedProtocol = protocol?.split(",")[0]?.trim().toLowerCase();
  if (normalizedProtocol) {
    return normalizedProtocol === "https" || normalizedProtocol === "https:";
  }

  return true;
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}
