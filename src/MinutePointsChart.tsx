import { useMemo } from 'react';
import GpuScatterGrid, { type ChartData, type Point } from "./GpuScatterGrid";
import type { Market } from "./markets";

interface TradeMinute {
  minute: number; // Unix timestamp rounded to minute
  upTrades: number;
  downTrades: number;
  upTotalSize: number;
  downTotalSize: number;
  upAvgPrice: number;
  downAvgPrice: number;
}

interface MinutePointsChartProps {
  markets: Market[];
}

function aggregateTradesByMinute(markets: Market[]): ChartData[] {
  return markets.map((market) => {
    // Group trades by minute, keeping up/down separate
    const minuteMap = new Map<number, TradeMinute>();
    
    // Process up trades
    market.up.trades.forEach(trade => {
      const minute = Math.floor(trade.timestamp / 60) * 60;
      
      if (!minuteMap.has(minute)) {
        minuteMap.set(minute, {
          minute,
          upTrades: 0,
          downTrades: 0,
          upTotalSize: 0,
          downTotalSize: 0,
          upAvgPrice: 0,
          downAvgPrice: 0
        });
      }
      
      const minuteData = minuteMap.get(minute)!;
      minuteData.upTrades += 1;
      minuteData.upTotalSize += trade.size;
    });

    // Process down trades
    market.down.trades.forEach(trade => {
      const minute = Math.floor(trade.timestamp / 60) * 60;
      
      if (!minuteMap.has(minute)) {
        minuteMap.set(minute, {
          minute,
          upTrades: 0,
          downTrades: 0,
          upTotalSize: 0,
          downTotalSize: 0,
          upAvgPrice: 0,
          downAvgPrice: 0
        });
      }
      
      const minuteData = minuteMap.get(minute)!;
      minuteData.downTrades += 1;
      minuteData.downTotalSize += trade.size;
    });

    // Calculate average prices for each minute
    minuteMap.forEach((minuteData, minute) => {
      const upTradesInMinute = market.up.trades.filter(t => Math.floor(t.timestamp / 60) * 60 === minute);
      const downTradesInMinute = market.down.trades.filter(t => Math.floor(t.timestamp / 60) * 60 === minute);
      
      if (upTradesInMinute.length > 0) {
        const upTotalValue = upTradesInMinute.reduce((sum, t) => sum + (t.price * t.size), 0);
        minuteData.upAvgPrice = upTotalValue / minuteData.upTotalSize;
      }
      
      if (downTradesInMinute.length > 0) {
        const downTotalValue = downTradesInMinute.reduce((sum, t) => sum + (t.price * t.size), 0);
        minuteData.downAvgPrice = downTotalValue / minuteData.downTotalSize;
      }
    });

    // Convert to points for the chart, creating separate points for up and down
    const points: Point[] = [];
    
    Array.from(minuteMap.values()).forEach(minuteData => {
      // Create up trade point if there are up trades
      if (minuteData.upTrades > 0) {
        points.push({
          x: minuteData.minute,
          y: minuteData.upAvgPrice, // Use average price as Y-axis (like original)
          size: minuteData.upTotalSize,
          color: [0.9, 0.2, 0.2] as [number, number, number] // Red for up trades
        });
      }
      
      // Create down trade point if there are down trades  
      if (minuteData.downTrades > 0) {
        points.push({
          x: minuteData.minute,
          y: minuteData.downAvgPrice, // Use average price as Y-axis (like original)
          size: minuteData.downTotalSize,
          color: [0.2, 0.8, 0.2] as [number, number, number] // Green for down trades
        });
      }
    });

    return {
      id: `${market.id}-minute-points`,
      title: `${market.title} (Per Minute)`,
      side: "Up", // Required field
      points,
      color: [0.5, 0.5, 0.8] as [number, number, number],
    };
  });
}

export default function MinutePointsChart({ markets }: MinutePointsChartProps) {
  const aggregatedCharts = useMemo(() => aggregateTradesByMinute(markets), [markets]);
  
  const stats = useMemo(() => {
    const totalMinutes = aggregatedCharts.reduce((sum, chart) => sum + chart.points.length, 0);
    const totalUpPoints = aggregatedCharts.reduce((sum, chart) => 
      sum + chart.points.filter(p => p.color && p.color[0] > 0.5).length, 0 // Red points (up trades)
    );
    const totalDownPoints = aggregatedCharts.reduce((sum, chart) => 
      sum + chart.points.filter(p => p.color && p.color[1] > 0.5).length, 0 // Green points (down trades)
    );
    const totalSize = aggregatedCharts.reduce((sum, chart) => 
      sum + chart.points.reduce((chartSum, point) => chartSum + (point.size || 0), 0), 0
    );
    
    return { totalMinutes, totalUpPoints, totalDownPoints, totalSize };
  }, [aggregatedCharts]);

  return (
    <div style={{ 
      backgroundColor: "#1e293b",
      borderRadius: "8px",
      padding: "16px",
      border: "1px solid #334155"
    }}>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ 
          margin: "0 0 8px 0", 
          color: "#f1f5f9",
          fontSize: "18px",
          fontWeight: "500"
        }}>
          Trades per Minute (Points Chart)
        </h2>
        <div style={{ 
          fontSize: "12px", 
          color: "#94a3b8",
          display: "flex",
          gap: "24px"
        }}>
          <span>Active minutes: {stats.totalMinutes}</span>
          <span style={{ color: "#f87171" }}>Up trades: {stats.totalUpPoints}</span>
          <span style={{ color: "#4ade80" }}>Down trades: {stats.totalDownPoints}</span>
          <span>Total volume: {stats.totalSize.toFixed(1)}</span>
        </div>
        <div style={{ 
          fontSize: "11px", 
          color: "#64748b",
          marginTop: "4px"
        }}>
          X: Time | Y: Average price | Size: Volume | Color: Red=Up trades, Green=Down trades
        </div>
      </div>
      
      <GpuScatterGrid
        charts={aggregatedCharts}
        columns={6}
        cellHeight={280}
        cellGap={20}
        pointSizeRange={[2, 8]}
      />
    </div>
  );
}
