// Self-contained Offline HiDPI Canvas Charts for RailPulse Pro Admin Analytics
window.RailCharts = (function () {
  function setupCanvas(canvas, height = 240) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(300, rect.width || 500);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width, height };
  }

  function drawRevenueAreaChart(canvas, data) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas, 250);
    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 13px system-ui';
      ctx.fillText('No revenue data available for this period.', 24, height / 2);
      return;
    }

    const pad = { top: 24, right: 20, bottom: 38, left: 64 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.revenue), 100) * 1.15;

    const isLight = document.documentElement.dataset.theme === 'light';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.12)';
    const textMuted = isLight ? '#475569' : '#94a3b8';
    const dotBg = isLight ? '#ffffff' : '#060913';

    // Horizontal grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = textMuted;
    ctx.font = '600 11px Consolas, monospace';
    ctx.textAlign = 'right';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.top + (ch * i) / steps;
      const val = maxVal * (1 - i / steps);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(`RM ${Math.round(val)}`, pad.left - 10, y + 4);
    }

    const points = data.map((d, i) => {
      const x = pad.left + (data.length === 1 ? cw / 2 : (cw * i) / (data.length - 1));
      const y = pad.top + ch - (d.revenue / maxVal) * ch;
      return { x, y, ...d };
    });

    // Area gradient
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.38)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + ch);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Points & X-Axis Labels
    ctx.textAlign = 'center';
    const labelStride = Math.max(1, Math.ceil(points.length / 7));
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = dotBg;
      ctx.fill();
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      if (i % labelStride === 0 || i === points.length - 1) {
        ctx.fillStyle = textMuted;
        ctx.font = '600 10.5px Consolas, monospace';
        ctx.fillText(p.day.slice(5), p.x, height - 12);
      }
    });
  }

  function drawDonutChart(canvas, items) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas, 250);
    ctx.clearRect(0, 0, width, height);

    const isLight = document.documentElement.dataset.theme === 'light';
    const textMain = isLight ? '#0f172a' : '#f8fafc';
    const textMuted = isLight ? '#475569' : '#94a3b8';

    const total = (items || []).reduce((a, b) => a + b.revenue, 0);
    if (!total) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 13px system-ui';
      ctx.fillText('No class data yet.', 24, height / 2);
      return;
    }

    const palette = {
      'First Class': '#f59e0b',
      'Business': '#06b6d4',
      'Economy': '#6366f1'
    };

    const cx = Math.min(width * 0.34, 120);
    const cy = height / 2;
    const r = Math.min(cx - 18, cy - 18, 84);
    let start = -Math.PI / 2;

    items.forEach(item => {
      const slice = (item.revenue / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.strokeStyle = palette[item.coach_class] || '#22d3ee';
      ctx.lineWidth = 22;
      ctx.stroke();
      start += slice;
    });

    // Center label
    ctx.textAlign = 'center';
    ctx.fillStyle = textMuted;
    ctx.font = '700 10px system-ui';
    ctx.fillText('TOTAL REV', cx, cy - 8);
    ctx.fillStyle = textMain;
    ctx.font = '800 14px Consolas, monospace';
    ctx.fillText(`RM ${Math.round(total)}`, cx, cy + 12);

    // Legend on right
    const lx = cx + r + 34;
    let ly = cy - (items.length * 26) / 2 + 12;
    ctx.textAlign = 'left';
    items.forEach(item => {
      const pct = ((item.revenue / total) * 100).toFixed(1);
      ctx.fillStyle = palette[item.coach_class] || '#22d3ee';
      ctx.beginPath();
      ctx.roundRect(lx, ly - 9, 11, 11, 3);
      ctx.fill();

      ctx.fillStyle = textMain;
      ctx.font = '700 12px system-ui';
      ctx.fillText(`${item.coach_class} (${pct}%)`, lx + 18, ly);

      ctx.fillStyle = textMuted;
      ctx.font = '600 11px Consolas, monospace';
      ctx.fillText(`RM ${item.revenue.toFixed(2)} · ${item.tickets} pax`, lx + 18, ly + 15);
      ly += 38;
    });
  }

  return { drawRevenueAreaChart, drawDonutChart };
})();
