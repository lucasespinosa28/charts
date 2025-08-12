// src/GpuScatterGrid.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import createREGL from "regl";
import type { Regl } from "regl";

export type Point = { x: number; y: number; size?: number; color?: [number, number, number] };
export type ChartData = {
  id: string;
  title: string;
  side: "Up" | "Down";
  points: { x: number; y: number; size?: number; color?: [number, number, number] }[];
  color?: [number, number, number];
};

interface MyTradeData {
  chartIndex: number;
  trades: {
    timestamp: number;
    price: number;
    outcome: string;
  }[];
}

type Props = {
  charts: ChartData[];
  columns?: number;
  cellHeight?: number;
  cellGap?: number;
  pointSizeRange?: [number, number];
  defaultColor?: [number, number, number];
  myTradesData?: MyTradeData[];
};

type Prepared = {
  id: string;
  pos: Float32Array;
  size: Float32Array;
  color: Float32Array;
  count: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};



export default function GpuScatterGrid({
  charts,
  columns = 6,
  cellHeight = 280,
  cellGap = 20,
  pointSizeRange = [2, 12],
  defaultColor = [0.35, 0.52, 0.92],
  myTradesData = [],
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reglRef = useRef<Regl | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: { price: number; time: number; size: number; side: string }[];
  } | null>(null);

  // Process and normalize chart data
  const prepared: Prepared[] = useMemo(() => {
    return charts.map((c) => {
      if (c.points.length === 0) {
        return {
          id: c.id,
          pos: new Float32Array(0),
          size: new Float32Array(0),
          color: new Float32Array(0),
          count: 0,
          xmin: 0,
          xmax: 1,
          ymin: 0,
          ymax: 1,
        };
      }

      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      let smin = Infinity, smax = -Infinity;

      // Find ranges
      for (const p of c.points) {
        if (p.x < xmin) xmin = p.x;
        if (p.x > xmax) xmax = p.x;
        if (p.y < ymin) ymin = p.y;
        if (p.y > ymax) ymax = p.y;
        const s = p.size ?? 1;
        if (s < smin) smin = s;
        if (s > smax) smax = s;
      }

      // Add small padding to ranges
      const dx = xmax - xmin || 1;
      const dy = ymax - ymin || 1;
      const ds = smax - smin || 1;
      const padding = 0.05; // 5% padding
      xmin -= dx * padding;
      xmax += dx * padding;
      ymin -= dy * padding;
      ymax += dy * padding;

      const n = c.points.length;
      const pos = new Float32Array(n * 2);
      const size = new Float32Array(n);
      const color = new Float32Array(n * 3);

      for (let i = 0; i < n; i++) {
        const p = c.points[i];
        
        // Normalize to [0, 1] first
        let ux = (p.x - xmin) / (xmax - xmin);
        let uy = (p.y - ymin) / (ymax - ymin);
        
        // Clamp to ensure points stay within [0, 1]
        ux = Math.max(0, Math.min(1, ux));
        uy = Math.max(0, Math.min(1, uy));
        
        // Add padding to keep points away from edges (15% padding on each side)
        const paddedUx = 0.15 + ux * 0.7; // Maps [0,1] to [0.15, 0.85]
        const paddedUy = 0.15 + uy * 0.7; // Maps [0,1] to [0.15, 0.85]
        
        // Convert to clip space [-1, 1], flip Y for WebGL (screen coordinates)
        pos[2 * i] = paddedUx * 2 - 1;     // X: [0.15,0.85] -> [-0.7, 0.7]
        pos[2 * i + 1] = (1 - paddedUy) * 2 - 1; // Y: [0.15,0.85] -> [0.7, -0.7] (flipped)

        // Size mapping
        const us = ((p.size ?? 1) - smin) / ds;
        size[i] = pointSizeRange[0] + us * (pointSizeRange[1] - pointSizeRange[0]);
        
        // Color
        const pointColor = p.color ?? c.color ?? defaultColor;
        color[3 * i] = pointColor[0];
        color[3 * i + 1] = pointColor[1];
        color[3 * i + 2] = pointColor[2];
      }

      return { 
        id: c.id, 
        pos, 
        size, 
        color, 
        count: n, 
        xmin: xmin + dx * padding, 
        xmax: xmax - dx * padding, 
        ymin: ymin + dy * padding, 
        ymax: ymax - dy * padding 
      };
    });
  }, [charts, pointSizeRange, defaultColor]);

  const rows = Math.ceil(prepared.length / columns);
  const heightPx = rows * cellHeight + Math.max(0, rows - 1) * cellGap + 40; // Add extra bottom margin

  console.log(`Grid setup: ${prepared.length} charts, ${rows} rows, ${columns} columns, heightPx: ${heightPx}`);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const regl = createREGL({ canvas, attributes: { antialias: true } });
    reglRef.current = regl;

    const buffers = prepared.map((c) => ({
      pos: regl.buffer({ usage: "static", type: "float", data: c.pos }),
      size: regl.buffer({ usage: "static", type: "float", data: c.size }),
      color: regl.buffer({ usage: "static", type: "float", data: c.color }),
      count: c.count,
    }));

    const drawPoints = regl({
      vert: `
        precision mediump float;
        attribute vec2 position;
        attribute float psize;
        attribute vec3 pcolor;
        uniform float dpr;
        varying vec3 vColor;
        void main () {
          gl_Position = vec4(position, 0.0, 1.0);
          gl_PointSize = psize * dpr;
          vColor = pcolor;
        }
      `,
      frag: `
        precision mediump float;
        varying vec3 vColor;
        void main () {
          vec2 d = gl_PointCoord - vec2(0.5);
          if (dot(d,d) > 0.25) discard;
          gl_FragColor = vec4(vColor, 0.9);
        }
      `,
      attributes: {
        position: regl.prop("pos" as any),
        psize: regl.prop("size" as any),
        pcolor: regl.prop("color" as any),
      },
      uniforms: {
        dpr: () => window.devicePixelRatio || 1,
      },
      count: regl.prop("count" as any),
      primitive: "points",
      blend: {
        enable: true,
        func: { srcRGB: "src alpha", srcAlpha: "one", dstRGB: "one minus src alpha", dstAlpha: "one minus src alpha" },
      },
      viewport: regl.prop("viewport" as any),
      scissor: {
        enable: regl.prop("scissor.enable" as any),
        box: regl.prop("scissor.box" as any),
      },
    });

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || 1;
      
      // Calculate the actual required height based on number of rows
      const cols = columns;
      const rows = Math.ceil(prepared.length / cols);
      const requiredHeight = rows * cellHeight + Math.max(0, rows - 1) * cellGap + 40; // Add extra margin
      
      // Use the larger of current height or required height
      const cssHeight = Math.max(canvas.clientHeight || 1, requiredHeight);
      
      // Set canvas dimensions
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
      
      // Update canvas style height to match required height
      canvas.style.height = cssHeight + "px";

      regl.poll();
      regl.clear({ color: [0.118, 0.161, 0.231, 1], depth: 1 });

      const gap = cellGap;
      const cellW = (cssWidth - (cols - 1) * gap) / cols;
      const cellH = cellHeight;

      // Log dimensions for debugging
      console.log(`Rendering ${prepared.length} charts in ${rows} rows, canvas: ${cssWidth}x${cssHeight}, required: ${requiredHeight}`);

      for (let i = 0; i < buffers.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = Math.floor(col * (cellW + gap));
        const y = Math.floor(row * (cellH + gap));
        const w = Math.floor(cellW);
        const h = Math.floor(cellH);

        // Calculate viewport Y (WebGL coordinates are bottom-up)
        const viewportY = Math.floor(cssHeight - (y + h));
        
        // Ensure viewport is within bounds
        const safeViewportY = Math.max(0, Math.min(viewportY, cssHeight - h));
        const safeY = Math.max(0, Math.min(y, cssHeight - h));
        
        // Only render if the chart is visible and has points
        if (safeViewportY >= 0 && safeY < cssHeight && buffers[i].count > 0) {
          // Log chart position for debugging bottom charts
          if (row >= rows - 1) {
            console.log(`Bottom chart ${i}: row=${row}, y=${y}, viewportY=${viewportY}, safeViewportY=${safeViewportY}, cssHeight=${cssHeight}`);
          }
          
          drawPoints({
            ...buffers[i],
            viewport: { x, y: safeViewportY, width: w, height: h },
            scissor: { enable: true, box: { x, y: safeViewportY, width: w, height: h } },
          });
        }
      }
    };

    const ro = new ResizeObserver(() => render());
    ro.observe(canvas);
    requestAnimationFrame(render);

    return () => {
      ro.disconnect();
      buffers.forEach((b) => {
        try { b.pos.destroy(); } catch { /* ignore */ }
        try { b.size.destroy(); } catch { /* ignore */ }
        try { b.color.destroy(); } catch { /* ignore */ }
      });
      try { regl.destroy(); } catch { /* ignore */ }
      reglRef.current = null;
    };
  }, [prepared, columns, cellGap, cellHeight, heightPx]);

  // Mouse event handler for tooltips
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const cols = columns;
    const gap = cellGap;
    const cellW = (rect.width - (cols - 1) * gap) / cols;
    const cellH = cellHeight;

    const col = Math.floor(mouseX / (cellW + gap));
    const row = Math.floor(mouseY / (cellH + gap));
    const chartIndex = row * cols + col;

    if (chartIndex >= 0 && chartIndex < charts.length) {
      const chart = charts[chartIndex];
      const prep = prepared[chartIndex];
      
      const localX = mouseX - col * (cellW + gap);
      const localY = mouseY - row * (cellH + gap);
      
      if (localX >= 0 && localX <= cellW && localY >= 0 && localY <= cellH) {
        // Convert mouse position to normalized coordinates [0, 1]
        const normX = localX / cellW;
        const normY = localY / cellH;
        
        // Reverse the padding transformation: [15%, 85%] -> [0, 1]
        const unpaddedX = Math.max(0, Math.min(1, (normX - 0.15) / 0.7));
        const unpaddedY = Math.max(0, Math.min(1, (normY - 0.15) / 0.7));
        
        // Convert to data coordinates
        const cursorTime = prep.xmin + unpaddedX * (prep.xmax - prep.xmin);
        const cursorPrice = prep.ymax - unpaddedY * (prep.ymax - prep.ymin);
        
        const timeThreshold = (prep.xmax - prep.xmin) * 0.02;
        const priceThreshold = (prep.ymax - prep.ymin) * 0.02;
        
        const nearbyPoints = chart.points.filter(point => 
          Math.abs(point.x - cursorTime) < timeThreshold &&
          Math.abs(point.y - cursorPrice) < priceThreshold
        );
        
        if (nearbyPoints.length > 0) {
          const pointsData = nearbyPoints.map(point => {
            const p = point as { x: number; y: number; size?: number; color?: [number, number, number] };
            const isUpTrade = p.color && p.color[0] > p.color[1];
            
            return {
              price: p.y,
              time: p.x,
              size: p.size || 1,
              side: isUpTrade ? "Up" : "Down"
            };
          });
          
          setTooltip({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            data: pointsData
          });
        } else {
          setTooltip(null);
        }
      } else {
        setTooltip(null);
      }
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: heightPx + "px",
          display: "block",
          backgroundColor: "#1e293b",
          borderRadius: "8px",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            backgroundColor: "rgba(30, 41, 59, 0.95)",
            color: "#f1f5f9",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            border: "1px solid #475569",
            zIndex: 1000,
            whiteSpace: "nowrap",
            maxWidth: "300px",
          }}
        >
          {tooltip.data.length === 1 ? (
            <>
              <div>Side: {tooltip.data[0].side}</div>
              <div>Price: ${tooltip.data[0].price.toFixed(3)}</div>
              <div>Size: {tooltip.data[0].size.toFixed(2)}</div>
              <div>Time: {new Date(tooltip.data[0].time * 1000).toLocaleTimeString()}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                {tooltip.data.length} trades at {new Date(tooltip.data[0].time * 1000).toLocaleTimeString()}
              </div>
              {tooltip.data.map((point, index) => (
                <div key={index} style={{ 
                  marginBottom: index < tooltip.data.length - 1 ? "2px" : "0",
                  paddingLeft: "8px",
                  borderLeft: `2px solid ${point.side === "Up" ? "#ff4444" : "#44ff44"}`
                }}>
                  <span style={{ color: point.side === "Up" ? "#ff6666" : "#66ff66" }}>
                    {point.side}
                  </span>: ${point.price.toFixed(3)} (Size: {point.size.toFixed(2)})
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Labels overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: heightPx + "px",
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: cellGap,
          pointerEvents: "none",
          padding: 0,
          zIndex: 2,
        }}
      >
        {charts.map((c, index) => {
          const prep = prepared[index];
          if (!prep || prep.count === 0) return <div key={c.id} />;

          const timeStamps = c.points.map(p => p.x);
          const prices = c.points.map(p => p.y);
          const minTime = Math.min(...timeStamps);
          const maxTime = Math.max(...timeStamps);
          const midTime = (minTime + maxTime) / 2;
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const midPrice = (minPrice + maxPrice) / 2;
          
          const formatTime = (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            return `${minutes}:${seconds}`;
          };

          return (
            <div 
              key={c.id} 
              style={{ 
                height: cellHeight, 
                position: "relative", 
                overflow: "hidden",
                backgroundColor: "transparent",
                border: "1px solid #334155",
                borderRadius: "8px",
              }}
            >
              {/* Title */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#f1f5f9",
                  opacity: 0.5,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  maxWidth: "80%",
                  textAlign: "center",
                  pointerEvents: "none",
                  zIndex: 5
                }}
                title={c.title}
              >
                {c.title.length > 35 ? c.title.substring(0, 35) + "..." : c.title}
              </div>

              {/* Price labels */}
              <div style={{ position: "absolute", left: 4, top: 10, fontSize: 9, color: "#94a3b8", fontWeight: "500" }}>
                ${maxPrice.toFixed(2)}
              </div>
              <div style={{ position: "absolute", left: 4, top: "50%", fontSize: 9, color: "#94a3b8", transform: "translateY(-50%)", fontWeight: "500" }}>
                ${midPrice.toFixed(2)}
              </div>
              <div style={{ position: "absolute", left: 4, bottom: 35, fontSize: 9, color: "#94a3b8", fontWeight: "500" }}>
                ${minPrice.toFixed(2)}
              </div>

              {/* Time labels */}
              {timeStamps.length > 0 && (
                <>
                  <div style={{ position: "absolute", left: 45, bottom: 6, fontSize: 9, color: "#64748b", fontWeight: "500" }}>
                    {formatTime(minTime)}
                  </div>
                  <div style={{ position: "absolute", left: "50%", bottom: 6, fontSize: 9, color: "#64748b", transform: "translateX(-50%)", fontWeight: "500" }}>
                    {formatTime(midTime)}
                  </div>
                  <div style={{ position: "absolute", right: 12, bottom: 6, fontSize: 9, color: "#64748b", fontWeight: "500" }}>
                    {formatTime(maxTime)}
                  </div>
                </>
              )}

              {/* Side indicators */}
              <div style={{
                position: "absolute",
                top: "50%",
                right: 8,
                transform: "translateY(-50%)",
                fontSize: 8,
                color: "#94a3b8",
                display: "flex",
                flexDirection: "column",
                gap: "2px"
              }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  padding: "2px 4px",
                  borderRadius: "3px"
                }}>
                  <div style={{ width: "6px", height: "6px", backgroundColor: "#ef4444", borderRadius: "50%" }}></div>
                  <span>UP</span>
                </div>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px",
                  backgroundColor: "rgba(34, 197, 94, 0.2)",
                  padding: "2px 4px",
                  borderRadius: "3px"
                }}>
                  <div style={{ width: "6px", height: "6px", backgroundColor: "#22c55e", borderRadius: "50%" }}></div>
                  <span>DOWN</span>
                </div>
              </div>

              {/* MyTrades Crosshairs */}
              {myTradesData && myTradesData.length > 0 && (() => {
                const myTradesForChart = myTradesData.find(mt => mt.chartIndex === index);
                if (!myTradesForChart || myTradesForChart.trades.length === 0) {
                  return null;
                }
                
                return myTradesForChart.trades.map((trade, tradeIndex) => {
                  // Skip if trade is outside the time/price range of this chart
                  if (trade.timestamp < minTime || trade.timestamp > maxTime || 
                      trade.price < minPrice || trade.price > maxPrice) {
                    return null;
                  }
                  
                  // Calculate normalized position [0, 1]
                  const timeRange = maxTime - minTime || 1;
                  const priceRange = maxPrice - minPrice || 1;
                  let normalizedX = (trade.timestamp - minTime) / timeRange;
                  let normalizedY = (maxPrice - trade.price) / priceRange;
                  
                  // Clamp to [0, 1]
                  normalizedX = Math.max(0, Math.min(1, normalizedX));
                  normalizedY = Math.max(0, Math.min(1, normalizedY));
                  
                  // Apply same 15% padding as points: [0,1] -> [15%, 85%]
                  const paddedX = (15 + normalizedX * 70); // 15% + normalized * 70%
                  const paddedY = (15 + normalizedY * 70); // 15% + normalized * 70%
                  
                  return (
                    <div key={`trade-${index}-${tradeIndex}`}>
                      {/* Vertical line */}
                      <div
                        style={{
                          position: "absolute",
                          left: `${paddedX}%`,
                          top: "8px",
                          bottom: "28px",
                          width: "2px",
                          backgroundColor: "#b865f7",
                          opacity: 0.9,
                          pointerEvents: "none",
                          zIndex: 15,
                        }}
                      />
                      {/* Horizontal line */}
                      <div
                        style={{
                          position: "absolute",
                          left: "15%",
                          right: "15%",
                          top: `${paddedY}%`,
                          height: "2px",
                          backgroundColor: "#b865f7",
                          opacity: 0.9,
                          pointerEvents: "none",
                          zIndex: 15,
                        }}
                      />
                      {/* Center point */}
                      <div
                        style={{
                          position: "absolute",
                          left: `calc(${paddedX}% - 4px)`,
                          top: `calc(${paddedY}% - 4px)`,
                          width: "8px",
                          height: "8px",
                          backgroundColor: "#b865f7",
                          borderRadius: "50%",
                          border: "2px solid #1e293b",
                          pointerEvents: "none",
                          zIndex: 20,
                        }}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
