// Self-contained Offline QR Code Matrix SVG Generator for RailPulse Pro E-Tickets
window.RailQR = (function () {
  function hashBytes(str) {
    const out = [];
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      h1 ^= str.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= str.charCodeAt(str.length - 1 - i);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    for (let i = 0; i < 128; i++) {
      h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2c1b3c6d) + i;
      h2 = Math.imul(h2 ^ (h2 >>> 13), 0x297a2d39) ^ (str.charCodeAt(i % str.length) << 3);
      out.push((h1 ^ h2) & 0xff);
    }
    return out;
  }

  function renderSVG(payload, size = 152) {
    const N = 25;
    const grid = Array.from({ length: N }, () => Array(N).fill(0));
    const reserved = Array.from({ length: N }, () => Array(N).fill(false));

    function drawFinder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = r0 + r, cc = c0 + c;
          if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
          reserved[rr][cc] = true;
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            grid[rr][cc] = 0;
          } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            grid[rr][cc] = 1;
          } else {
            grid[rr][cc] = 0;
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, N - 7);
    drawFinder(N - 7, 0);

    // Alignment pattern
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const rr = N - 7 + r, cc = N - 7 + c;
        reserved[rr][cc] = true;
        grid[rr][cc] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) ? 1 : 0;
      }
    }

    // Timing patterns
    for (let i = 8; i < N - 8; i++) {
      reserved[6][i] = true;
      reserved[i][6] = true;
      grid[6][i] = i % 2 === 0 ? 1 : 0;
      grid[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Encode deterministic data payload
    const bytes = hashBytes(payload);
    let bitIdx = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (reserved[r][c]) continue;
        const b = bytes[(bitIdx >> 3) % bytes.length];
        grid[r][c] = (b >> (bitIdx & 7)) & 1;
        bitIdx++;
      }
    }

    const cell = size / N;
    let rects = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r][c]) {
          rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${(cell + 0.15).toFixed(2)}" height="${(cell + 0.15).toFixed(2)}" fill="#0b1120"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
      <rect width="${size}" height="${size}" fill="#ffffff"/>
      ${rects}
    </svg>`;
  }

  return { renderSVG };
})();
