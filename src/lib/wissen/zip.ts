// TOF-0839: kleiner ZIP-Schreiber (Deflate über node:zlib), ohne neue Abhängigkeit —
// das Produkt läuft auch on-premise/offline. Reicht für einige hundert Markdown-Dateien.
import { deflateRawSync, inflateRawSync } from "zlib";

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABELLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosZeit(d: Date): { zeit: number; datum: number } {
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    datum: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ZipDatei = { pfad: string; inhalt: string | Uint8Array };

/** Baut ein ZIP-Archiv (UTF-8-Dateinamen, Flag 0x0800). */
export function baueZip(dateien: ZipDatei[], jetzt = new Date()): Buffer {
  const lokale: Buffer[] = [];
  const zentral: Buffer[] = [];
  let offset = 0;
  const { zeit, datum } = dosZeit(jetzt);
  for (const d of dateien) {
    const name = Buffer.from(d.pfad.replace(/\\/g, "/").replace(/^\/+/, ""), "utf8");
    const roh = typeof d.inhalt === "string" ? Buffer.from(d.inhalt, "utf8") : Buffer.from(d.inhalt);
    const gepackt = deflateRawSync(roh);
    const crc = crc32(roh);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(zeit, 10);
    lh.writeUInt16LE(datum, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(gepackt.length, 18);
    lh.writeUInt32LE(roh.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    lokale.push(lh, name, gepackt);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(zeit, 12);
    ch.writeUInt16LE(datum, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(gepackt.length, 20);
    ch.writeUInt32LE(roh.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    zentral.push(ch, name);

    offset += lh.length + name.length + gepackt.length;
  }
  const zentralBuf = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(zentralBuf.length, 12);
  ende.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokale, zentralBuf, ende]);
}

/** Gegenstück für Tests: liest Namen + Inhalt (nur Deflate/Store). */
export function leseZip(buf: Buffer): { pfad: string; inhalt: string }[] {
  const out: { pfad: string; inhalt: string }[] = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const methode = buf.readUInt16LE(p + 8);
    const gross = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const start = p + 30 + nameLen + extraLen;
    const daten = buf.subarray(start, start + gross);
    out.push({ pfad: name, inhalt: (methode === 8 ? inflateRawSync(daten) : daten).toString("utf8") });
    p = start + gross;
  }
  return out;
}
