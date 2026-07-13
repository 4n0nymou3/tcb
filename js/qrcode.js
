const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function polyMul(p1, p2) {
  const coeff = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      coeff[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return coeff;
}

function polyMod(dividend, divisor) {
  let result = new Uint8Array(dividend);
  while (result.length - divisor.length >= 0) {
    const coeff = result[0];
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= gfMul(divisor[i], coeff);
    }
    let offset = 0;
    while (offset < result.length && result[offset] === 0) offset++;
    result = result.slice(offset);
  }
  return result;
}

function generateECPolynomial(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, new Uint8Array([1, GF_EXP[i]]));
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const genPoly = generateECPolynomial(ecCount);
  const paddedData = new Uint8Array(data.length + ecCount);
  paddedData.set(data);
  const remainder = polyMod(paddedData, genPoly);
  const start = ecCount - remainder.length;
  if (start > 0) {
    const buff = new Uint8Array(ecCount);
    buff.set(remainder, start);
    return buff;
  }
  return remainder;
}

const EC_LEVEL = {
  L: { bit: 1, col: 0 },
  M: { bit: 0, col: 1 },
  Q: { bit: 3, col: 2 },
  H: { bit: 2, col: 3 }
};

const EC_BLOCKS_TABLE = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4,
  2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10, 11,
  4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16, 6, 11, 16, 19,
  6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17, 23, 34,
  9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34, 37, 12, 25, 34, 40,
  13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54,
  18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70,
  22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81
];

const EC_CODEWORDS_TABLE = [
  7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88,
  36, 64, 96, 112, 40, 72, 108, 130, 48, 88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224,
  80, 150, 224, 264, 96, 176, 260, 308, 104, 198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432,
  144, 280, 408, 480, 168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224, 416, 600, 700,
  224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588, 870, 1050,
  336, 644, 952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200, 1440,
  480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570, 1064, 1590, 1890,
  600, 1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950, 2310, 750, 1372, 2040, 2430
];

function getBlocksCount(version, level) {
  return EC_BLOCKS_TABLE[(version - 1) * 4 + level.col];
}

function getTotalCodewordsCount(version, level) {
  return EC_CODEWORDS_TABLE[(version - 1) * 4 + level.col];
}

const MODE_BYTE = { id: 'Byte', bit: 1 << 2, ccBits: [8, 16, 16] };

function getCharCountIndicator(version) {
  if (version >= 1 && version < 10) return MODE_BYTE.ccBits[0];
  else if (version < 27) return MODE_BYTE.ccBits[1];
  return MODE_BYTE.ccBits[2];
}

function getSymbolSize(version) {
  return version * 4 + 17;
}

const CODEWORDS_COUNT = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
];

function getSymbolTotalCodewords(version) {
  return CODEWORDS_COUNT[version];
}

function getBCHDigit(data) {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}

function BitBuffer() {
  this.buffer = [];
  this.length = 0;
}
BitBuffer.prototype.put = function (num, length) {
  for (let i = 0; i < length; i++) {
    this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  }
};
BitBuffer.prototype.getLengthInBits = function () {
  return this.length;
};
BitBuffer.prototype.putBit = function (bit) {
  const bufIndex = Math.floor(this.length / 8);
  if (this.buffer.length <= bufIndex) this.buffer.push(0);
  if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
  this.length++;
};

function BitMatrix(size) {
  this.size = size;
  this.data = new Uint8Array(size * size);
  this.reservedBit = new Uint8Array(size * size);
}
BitMatrix.prototype.set = function (row, col, value, reserved) {
  const index = row * this.size + col;
  this.data[index] = value;
  if (reserved) this.reservedBit[index] = true;
};
BitMatrix.prototype.get = function (row, col) {
  return this.data[row * this.size + col];
};
BitMatrix.prototype.xor = function (row, col, value) {
  this.data[row * this.size + col] ^= value;
};
BitMatrix.prototype.isReserved = function (row, col) {
  return this.reservedBit[row * this.size + col];
};

function getAlignmentRowColCoords(version) {
  if (version === 1) return [];
  const posCount = Math.floor(version / 7) + 2;
  const size = getSymbolSize(version);
  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < posCount - 1; i++) {
    positions[i] = positions[i - 1] - intervals;
  }
  positions.push(6);
  return positions.reverse();
}

function getAlignmentPositions(version) {
  const coords = [];
  const pos = getAlignmentRowColCoords(version);
  const posLength = pos.length;
  for (let i = 0; i < posLength; i++) {
    for (let j = 0; j < posLength; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === posLength - 1) || (i === posLength - 1 && j === 0)) continue;
      coords.push([pos[i], pos[j]]);
    }
  }
  return coords;
}

function getFinderPositions(version) {
  const size = getSymbolSize(version);
  return [[0, 0], [size - 7, 0], [0, size - 7]];
}

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
const G15_BCH = getBCHDigit(G15);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G18_BCH = getBCHDigit(G18);

function getFormatEncodedBits(level, mask) {
  const data = (level.bit << 3) | mask;
  let d = data << 10;
  while (getBCHDigit(d) - G15_BCH >= 0) {
    d ^= (G15 << (getBCHDigit(d) - G15_BCH));
  }
  return ((data << 10) | d) ^ G15_MASK;
}

function getVersionEncodedBits(version) {
  let d = version << 12;
  while (getBCHDigit(d) - G18_BCH >= 0) {
    d ^= (G18 << (getBCHDigit(d) - G18_BCH));
  }
  return (version << 12) | d;
}

const PENALTY = { N1: 3, N2: 3, N3: 40, N4: 10 };

function getPenaltyN1(data) {
  const size = data.size;
  let points = 0, sameCountCol = 0, sameCountRow = 0, lastCol = null, lastRow = null;
  for (let row = 0; row < size; row++) {
    sameCountCol = sameCountRow = 0;
    lastCol = lastRow = null;
    for (let col = 0; col < size; col++) {
      let module = data.get(row, col);
      if (module === lastCol) sameCountCol++;
      else {
        if (sameCountCol >= 5) points += PENALTY.N1 + (sameCountCol - 5);
        lastCol = module;
        sameCountCol = 1;
      }
      module = data.get(col, row);
      if (module === lastRow) sameCountRow++;
      else {
        if (sameCountRow >= 5) points += PENALTY.N1 + (sameCountRow - 5);
        lastRow = module;
        sameCountRow = 1;
      }
    }
    if (sameCountCol >= 5) points += PENALTY.N1 + (sameCountCol - 5);
    if (sameCountRow >= 5) points += PENALTY.N1 + (sameCountRow - 5);
  }
  return points;
}

function getPenaltyN2(data) {
  const size = data.size;
  let points = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
      if (last === 4 || last === 0) points++;
    }
  }
  return points * PENALTY.N2;
}

function getPenaltyN3(data) {
  const size = data.size;
  let points = 0, bitsCol = 0, bitsRow = 0;
  for (let row = 0; row < size; row++) {
    bitsCol = bitsRow = 0;
    for (let col = 0; col < size; col++) {
      bitsCol = ((bitsCol << 1) & 0x7FF) | data.get(row, col);
      if (col >= 10 && (bitsCol === 0x5D0 || bitsCol === 0x05D)) points++;
      bitsRow = ((bitsRow << 1) & 0x7FF) | data.get(col, row);
      if (col >= 10 && (bitsRow === 0x5D0 || bitsRow === 0x05D)) points++;
    }
  }
  return points * PENALTY.N3;
}

function getPenaltyN4(data) {
  let darkCount = 0;
  const modulesCount = data.data.length;
  for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
  const k = Math.abs(Math.ceil((darkCount * 100 / modulesCount) / 5) - 10);
  return k * PENALTY.N4;
}

function getMaskAt(maskPattern, i, j) {
  switch (maskPattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return (i * j) % 2 + (i * j) % 3 === 0;
    case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
    case 7: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
    default: throw new Error('bad maskPattern:' + maskPattern);
  }
}

function applyMask(pattern, data) {
  const size = data.size;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      if (data.isReserved(row, col)) continue;
      data.xor(row, col, getMaskAt(pattern, row, col));
    }
  }
}

function getBestMask(data, setupFormatFunc) {
  let bestPattern = 0, lowerPenalty = Infinity;
  for (let p = 0; p < 8; p++) {
    setupFormatFunc(p);
    applyMask(p, data);
    const penalty = getPenaltyN1(data) + getPenaltyN2(data) + getPenaltyN3(data) + getPenaltyN4(data);
    applyMask(p, data);
    if (penalty < lowerPenalty) {
      lowerPenalty = penalty;
      bestPattern = p;
    }
  }
  return bestPattern;
}

function getCapacity(version, level) {
  const totalCodewords = getSymbolTotalCodewords(version);
  const ecTotalCodewords = getTotalCodewordsCount(version, level);
  const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
  const usableBits = dataTotalCodewordsBits - (getCharCountIndicator(version) + 4);
  return Math.floor(usableBits / 8);
}

function getBestVersionForData(byteLength, level) {
  for (let v = 1; v <= 40; v++) {
    if (byteLength <= getCapacity(v, level)) return v;
  }
  return undefined;
}

function setupFinderPattern(matrix, version) {
  const size = matrix.size;
  const positions = getFinderPositions(version);
  for (let p = 0; p < positions.length; p++) {
    const row = positions[p][0], col = positions[p][1];
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || size <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || size <= col + c) continue;
        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix.set(row + r, col + c, true, true);
        } else {
          matrix.set(row + r, col + c, false, true);
        }
      }
    }
  }
}

function setupTimingPattern(matrix) {
  const size = matrix.size;
  for (let r = 8; r < size - 8; r++) {
    const value = r % 2 === 0;
    matrix.set(r, 6, value, true);
    matrix.set(6, r, value, true);
  }
}

function setupAlignmentPattern(matrix, version) {
  const positions = getAlignmentPositions(version);
  for (let p = 0; p < positions.length; p++) {
    const row = positions[p][0], col = positions[p][1];
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
          matrix.set(row + r, col + c, true, true);
        } else {
          matrix.set(row + r, col + c, false, true);
        }
      }
    }
  }
}

function setupVersionInfo(matrix, version) {
  const size = matrix.size;
  const bits = getVersionEncodedBits(version);
  let row, col, mod;
  for (let i = 0; i < 18; i++) {
    row = Math.floor(i / 3);
    col = (i % 3) + size - 8 - 3;
    mod = ((bits >> i) & 1) === 1;
    matrix.set(row, col, mod, true);
    matrix.set(col, row, mod, true);
  }
}

function setupFormatInfo(matrix, level, maskPattern) {
  const size = matrix.size;
  const bits = getFormatEncodedBits(level, maskPattern);
  let mod;
  for (let i = 0; i < 15; i++) {
    mod = ((bits >> i) & 1) === 1;
    if (i < 6) matrix.set(i, 8, mod, true);
    else if (i < 8) matrix.set(i + 1, 8, mod, true);
    else matrix.set(size - 15 + i, 8, mod, true);
    if (i < 8) matrix.set(8, size - i - 1, mod, true);
    else if (i < 9) matrix.set(8, 15 - i - 1 + 1, mod, true);
    else matrix.set(8, 15 - i - 1, mod, true);
  }
  matrix.set(size - 8, 8, 1, true);
}

function setupData(matrix, data) {
  const size = matrix.size;
  let inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        if (!matrix.isReserved(row, col - c)) {
          let dark = false;
          if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
          matrix.set(row, col - c, dark);
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || size <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
}

function createCodewords(bitBuffer, version, level) {
  const totalCodewords = getSymbolTotalCodewords(version);
  const ecTotalCodewords = getTotalCodewordsCount(version, level);
  const dataTotalCodewords = totalCodewords - ecTotalCodewords;
  const ecTotalBlocks = getBlocksCount(version, level);
  const blocksInGroup2 = totalCodewords % ecTotalBlocks;
  const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
  const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
  const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
  const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
  const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;

  let offset = 0;
  const dcData = new Array(ecTotalBlocks);
  const ecData = new Array(ecTotalBlocks);
  let maxDataSize = 0;
  const buffer = new Uint8Array(bitBuffer.buffer);

  for (let b = 0; b < ecTotalBlocks; b++) {
    const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
    dcData[b] = buffer.slice(offset, offset + dataSize);
    ecData[b] = rsEncode(dcData[b], ecCount);
    offset += dataSize;
    maxDataSize = Math.max(maxDataSize, dataSize);
  }

  const data = new Uint8Array(totalCodewords);
  let index = 0;
  for (let i = 0; i < maxDataSize; i++) {
    for (let r = 0; r < ecTotalBlocks; r++) {
      if (i < dcData[r].length) data[index++] = dcData[r][i];
    }
  }
  for (let i = 0; i < ecCount; i++) {
    for (let r = 0; r < ecTotalBlocks; r++) {
      data[index++] = ecData[r][i];
    }
  }
  return data;
}

function createData(version, level, bytes) {
  const buffer = new BitBuffer();
  buffer.put(MODE_BYTE.bit, 4);
  buffer.put(bytes.length, getCharCountIndicator(version));
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

  const totalCodewords = getSymbolTotalCodewords(version);
  const ecTotalCodewords = getTotalCodewordsCount(version, level);
  const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;

  if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(0);

  const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
  for (let i = 0; i < remainingByte; i++) buffer.put(i % 2 ? 0x11 : 0xEC, 8);

  return createCodewords(buffer, version, level);
}

export function generateQRMatrix(text, levelName) {
  if (typeof text === 'undefined' || text === '') throw new Error('No input text');
  const level = EC_LEVEL[levelName] || EC_LEVEL.M;
  const bytes = new TextEncoder().encode(text);

  const version = getBestVersionForData(bytes.length, level);
  if (!version) throw new Error('data too long for QR code');

  const dataBits = createData(version, level, bytes);
  const size = getSymbolSize(version);
  const modules = new BitMatrix(size);

  setupFinderPattern(modules, version);
  setupTimingPattern(modules);
  setupAlignmentPattern(modules, version);
  setupFormatInfo(modules, level, 0);
  if (version >= 7) setupVersionInfo(modules, version);
  setupData(modules, dataBits);

  const maskPattern = getBestMask(modules, p => setupFormatInfo(modules, level, p));
  applyMask(maskPattern, modules);
  setupFormatInfo(modules, level, maskPattern);

  const grid = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) row.push(!!modules.get(r, c));
    grid.push(row);
  }
  return { size, grid };
}

export function qrMatrixToSvg(qr, margin) {
  const m = typeof margin === 'number' ? margin : 4;
  const dim = qr.size + m * 2;
  let d = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.grid[r][c]) d += `M${c + m},${r + m}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
}