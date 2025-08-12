import { useMemo } from 'react';
import type { Market } from "./markets";

interface TradeMinute {
  minute: number;
  tradesCount: number;
  totalSize: number;
  avgPrice: number;
}

interface MinuteHeatmapProps {
  markets: Market[];
  width?: number;
  height?: number;
}

function aggregateAllTradesByMinute(markets: Market[]): TradeMinute[] {
  const minuteMap = new Map<number, TradeMinute>();
  
  markets.forEach(market => {
    const allTrades = [
      ...market.up.trades,
      ...market.down.trades
    ];
    
    allTrades.forEach(trade => {
      const minute = Math.floor(trade.timestamp / 60) * 60;
      
      if (!minuteMap.has(minute)) {
        minuteMap.set(minute, {
          minute,
          tradesCount: 0,
          totalSize: 0,
          avgPrice: 0
        });
      }
      
      const minuteData = minuteMap.get(minute)!;
      minuteData.tradesCount += 1;
      minuteData.totalSize += trade.size;
    });
  });
  
  // Calculate average prices
  minuteMap.forEach((minuteData, minute) => {
    const allTrades = markets.flatMap(m => [...m.up.trades, ...m.down.trades]);
    const tradesInMinute = allTrades.filter(t => Math.floor(t.timestamp / 60) * 60 === minute);
    const totalValue = tradesInMinute.reduce((sum, t) => sum + (t.price * t.size), 0);
    minuteData.avgPrice = totalValue / minuteData.totalSize;
  });
  
  return Array.from(minuteMap.values()).sort((a, b) => a.minute - b.minute);
}

export default function MinuteHeatmap({ markets, width = 320, height = 600 }: MinuteHeatmapProps) {
  const minuteData = useMemo(() => aggregateAllTradesByMinute(markets), [markets]);
  
  const { maxTrades, maxSize, minTime, maxTime } = useMemo(() => {
    if (minuteData.length === 0) return { maxTrades: 1, maxSize: 1, minTime: 0, maxTime: 0 };
    
    return {
      maxTrades: Math.max(...minuteData.map(d => d.tradesCount)),
      maxSize: Math.max(...minuteData.map(d => d.totalSize)),
      minTime: Math.min(...minuteData.map(d => d.minute)),
      maxTime: Math.max(...minuteData.map(d => d.minute))
    };
  }, [minuteData]);
  
  // Create time buckets for heatmap rows
  const timeBuckets = useMemo(() => {
    const bucketCount = 30; // Number of time buckets
    const timeRange = maxTime - minTime;
    const bucketSize = timeRange / bucketCount;
    
    const buckets: Array<{
      label: string;
      tradesCount: number;
      totalSize: number;
      avgPrice: number;
    }> = [];
    
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = minTime + (i * bucketSize);
      const bucketEnd = bucketStart + bucketSize;
      
      const bucketMinutes = minuteData.filter(d => 
        d.minute >= bucketStart && d.minute < bucketEnd
      );
      
      const tradesCount = bucketMinutes.reduce((sum, d) => sum + d.tradesCount, 0);
      const totalSize = bucketMinutes.reduce((sum, d) => sum + d.totalSize, 0);
      const avgPrice = bucketMinutes.length > 0 
        ? bucketMinutes.reduce((sum, d) => sum + d.avgPrice, 0) / bucketMinutes.length 
        : 0;
      
      // Format time label
      const date = new Date(bucketStart * 1000);
      const timeLabel = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      buckets.push({
        label: timeLabel,
        tradesCount,
        totalSize,
        avgPrice
      });
    }
    
    return buckets;
  }, [minuteData, minTime, maxTime]);

  return (
    <div style={{ 
      width, 
      height, 
      padding: "20px", 
      backgroundColor: "#1e293b",
      borderRadius: "8px",
      border: "1px solid #334155"
    }}>
      <h3 style={{ 
        margin: "0 0 20px 0", 
        fontSize: "16px", 
        fontWeight: "600",
        color: "#f1f5f9"
      }}>
        Minute Trading Heatmap
      </h3>
      
      <div style={{ height: height - 120, overflowY: "auto" }}>
        <div style={{ display: "flex", marginBottom: "8px" }}>
          <div style={{ 
            width: "60px", 
            fontSize: "11px", 
            color: "#94a3b8",
            textAlign: "right",
            paddingRight: "12px",
            fontWeight: "500"
          }}>
            Time
          </div>
          <div style={{ 
            flex: 1, 
            fontSize: "11px", 
            color: "#94a3b8",
            display: "flex",
            justifyContent: "space-between",
            paddingLeft: "8px"
          }}>
            <span>Trades</span>
            <span>Volume</span>
          </div>
        </div>
        
        {timeBuckets.map((bucket, index) => {
          const tradesIntensity = bucket.tradesCount / maxTrades;
          const sizeIntensity = bucket.totalSize / maxSize;
          const cellHeight = 18;
          
          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "2px",
                height: cellHeight,
                fontSize: "11px",
              }}
            >
              {/* Time label */}
              <div style={{ 
                width: "60px", 
                fontSize: "10px", 
                color: "#94a3b8",
                textAlign: "right",
                paddingRight: "12px",
                fontWeight: "500"
              }}>
                {bucket.label}
              </div>
              
              {/* Heatmap cell */}
              <div style={{ flex: 1, display: "flex", gap: "4px" }}>
                {/* Trades count visualization */}
                <div
                  style={{
                    flex: 1,
                    height: "16px",
                    backgroundColor: `rgba(34, 197, 94, ${0.1 + tradesIntensity * 0.8})`,
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "3px",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "6px",
                    color: tradesIntensity > 0.5 ? "#ffffff" : "#e2e8f0",
                    fontWeight: "500",
                  }}
                >
                  {bucket.tradesCount > 0 && (
                    <span style={{ fontSize: "9px" }}>
                      {bucket.tradesCount}
                    </span>
                  )}
                </div>
                
                {/* Volume visualization */}
                <div
                  style={{
                    flex: 1,
                    height: "16px",
                    backgroundColor: `rgba(59, 130, 246, ${0.1 + sizeIntensity * 0.8})`,
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: "3px",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "6px",
                    color: sizeIntensity > 0.5 ? "#ffffff" : "#e2e8f0",
                    fontWeight: "500",
                  }}
                >
                  {bucket.totalSize > 0 && (
                    <span style={{ fontSize: "9px" }}>
                      {bucket.totalSize.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div style={{ 
        marginTop: "16px", 
        fontSize: "10px", 
        color: "#94a3b8",
        borderTop: "1px solid #334155",
        paddingTop: "12px"
      }}>
        <div style={{ marginBottom: "4px" }}>
          Total active minutes: {minuteData.length}
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ 
              width: "12px", 
              height: "8px", 
              backgroundColor: "rgba(34, 197, 94, 0.6)",
              borderRadius: "2px"
            }}></div>
            <span>Trades</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ 
              width: "12px", 
              height: "8px", 
              backgroundColor: "rgba(59, 130, 246, 0.6)",
              borderRadius: "2px"
            }}></div>
            <span>Volume</span>
          </div>
        </div>
      </div>
    </div>
  );
}
