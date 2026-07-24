import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (!isIP(address)) return true;
  if (address.includes(":")) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function safePublicUrl(input: string) {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new Error("Enter a valid website URL.");
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites can be checked.");
  if (url.username || url.password || url.port) throw new Error("Credentials and custom ports are not supported.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local websites cannot be checked.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error("The website must resolve to a public address.");
  url.hash = "";
  return url;
}
