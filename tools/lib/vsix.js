// Reading files straight out of a .vsix, which is an ordinary zip.
//
// This is the structurally correct source of pristine bytes: a downloaded vsix
// has never been near kb-patch, so no reversal step is involved and no marker
// scan is needed to trust it. It also reaches versions that are not installed,
// which is the only way to test a rule against an older release.
//
// Implemented against the zip spec rather than a dependency: the harness is a
// maintenance tool and should not add supply chain to the project. Only the
// subset vsix files actually use is handled (no ZIP64, no encryption), and
// anything outside that subset is reported rather than misread.
//
// Kilo Code ships per-platform builds, so a download needs targetPlatform:
//   https://marketplace.visualstudio.com/_apis/public/gallery/publishers/kilocode
//     /vsextensions/kilo-code/<version>/vspackage?targetPlatform=darwin-arm64
// The response may be gzipped (Content-Encoding: gzip) even though a vsix is
// already a zip, so decompress once if `file` reports gzip rather than Zip.
const fs = require("fs");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_SENTINEL = 0xffffffff;

// The end-of-central-directory record sits at the tail, after a variable length
// comment, so it has to be found by scanning backwards for its signature.
function findEndOfCentralDirectory(buf) {
  const earliest = Math.max(0, buf.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN_SIZE; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

// filename -> { method, compressedSize, localHeaderOffset }
function readCentralDirectory(buf) {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd === -1) throw new Error("not a zip archive (no end-of-central-directory record)");

  const entryCount = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (directoryOffset === ZIP64_SENTINEL) {
    throw new Error("ZIP64 archives are not supported by this reader");
  }

  const entries = new Map();
  let cursor = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    entries.set(name, { method, compressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// The local header repeats the name and extra fields with its own lengths, so
// the payload offset must be computed from it rather than from the central
// directory copy.
function readEntry(buf, entry, name) {
  const offset = entry.localHeaderOffset;
  if (offset === ZIP64_SENTINEL) {
    throw new Error(`ZIP64 offset for ${name} is not supported`);
  }
  if (buf.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
    throw new Error(`corrupt local header for ${name}`);
  }
  const nameLength = buf.readUInt16LE(offset + 26);
  const extraLength = buf.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const payload = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(payload);
  if (entry.method === 8) return zlib.inflateRawSync(payload);
  throw new Error(`unsupported compression method ${entry.method} for ${name}`);
}

function openVsix(vsixPath) {
  if (!fs.existsSync(vsixPath)) throw new Error(`no such file: ${vsixPath}`);
  const buf = fs.readFileSync(vsixPath);
  const entries = readCentralDirectory(buf);
  return {
    has: (name) => entries.has(name),
    // Returns undefined for a missing entry so callers can treat an absent
    // bundle the same way they treat one missing from an install.
    read: (name) => {
      const entry = entries.get(name);
      return entry ? readEntry(buf, entry, name) : undefined;
    },
    names: () => [...entries.keys()],
  };
}

module.exports = { openVsix };
