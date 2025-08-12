import { useMemo } from "react";
import type { ChartData } from "./GpuScatterGrid";

type SizeBucket = {
  sizeRange: string;
  count: number;
  minSize: number;
  maxSize: number;
  priceBreakdown: {
    "0.90": number;
    "0.95": number;
  };
};

type Props = {
  charts: ChartData[];
  width?: number;
  height?: number;
};

export default function PriceFilteredSizeHeatmap({ charts, width = 300, height = 600 }: Props) {
  // Process trades only at price levels 0.90 and 0.95
  const sizeBuckets = useMemo(() => {
    // Collect sizes from trades at specific price levels
    const sizesAt090: number[] = [];
    const sizesAt095: number[] = [];
    const allFilteredSizes: number[] = [];
    
    charts.forEach(chart => {
      chart.points.forEach(point => {
        if (point.size && point.size > 0) {
          // Check if price is exactly 0.90 or 0.95 (with small tolerance for floating point)
          const price = point.y;
          if (Math.abs(price - 0.90) < 0.001) {
            sizesAt090.push(point.size);
            allFilteredSizes.push(point.size);
          } else if (Math.abs(price - 0.95) < 0.001) {
            sizesAt095.push(point.size);
            allFilteredSizes.push(point.size);
          }
        }
      });
    });

    if (allFilteredSizes.length === 0) return [];

    // Find the maximum size to determine how many buckets we need
    const maxSize = Math.max(...allFilteredSizes);
    
    // Create fixed size buckets: 0-5, 5-10, 10-15, 15-20, etc.
    const buckets: SizeBucket[] = [];
    const bucketSize = 5;
    
    // Calculate number of buckets needed (up to max size, rounded up)
    const numBuckets = Math.ceil(maxSize / bucketSize);
    
    for (let i = 0; i < numBuckets; i++) {
      const bucketMinSize = i * bucketSize;
      const bucketMaxSize = (i + 1) * bucketSize;
      
      const countAt090 = sizesAt090.filter(size => size >= bucketMinSize && size < bucketMaxSize).length;
      const countAt095 = sizesAt095.filter(size => size >= bucketMinSize && size < bucketMaxSize).length;
      const totalCount = countAt090 + countAt095;
      
      // Only include buckets that have trades
      if (totalCount > 0) {
        buckets.push({
          sizeRange: `${bucketMinSize}-${bucketMaxSize}`,
          count: totalCount,
          minSize: bucketMinSize,
          maxSize: bucketMaxSize,
          priceBreakdown: {
            "0.90": countAt090,
            "0.95": countAt095
          }
        });
      }
    }

    return buckets;
  }, [charts]);

  const maxCount = Math.max(...sizeBuckets.map(b => b.count));
  const totalTrades = sizeBuckets.reduce((sum, b) => sum + b.count, 0);
  const tradesAt090 = sizeBuckets.reduce((sum, b) => sum + b.priceBreakdown["0.90"], 0);
  const tradesAt095 = sizeBuckets.reduce((sum, b) => sum + b.priceBreakdown["0.95"], 0);

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
        margin: "0 0 16px 0", 
        fontSize: "16px", 
        fontWeight: "600",
        color: "#f1f5f9"
      }}>
        Size Distribution (0.90 & 0.95 Price)
      </h3>
      
      {/* Price legend */}
      <div style={{ 
        display: "flex", 
        gap: "16px", 
        marginBottom: "16px",
        fontSize: "11px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ 
            width: "12px", 
            height: "12px", 
            backgroundColor: "rgba(59, 130, 246, 0.7)",
            borderRadius: "2px"
          }} />
          <span style={{ color: "#94a3b8" }}>Price 0.90</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ 
            width: "12px", 
            height: "12px", 
            backgroundColor: "rgba(168, 85, 247, 0.7)",
            borderRadius: "2px"
          }} />
          <span style={{ color: "#94a3b8" }}>Price 0.95</span>
        </div>
      </div>
      
      <div style={{ height: height - 180, overflowY: "auto" }}>
        {sizeBuckets.map((bucket, index) => {
          const intensity = bucket.count / maxCount;
          const cellHeight = 32;
          
          // Calculate proportions for stacked bar
          const prop090 = bucket.count > 0 ? bucket.priceBreakdown["0.90"] / bucket.count : 0;
          const prop095 = bucket.count > 0 ? bucket.priceBreakdown["0.95"] / bucket.count : 0;
          
          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "4px",
                height: cellHeight,
                fontSize: "12px",
              }}
            >
              {/* Size range label */}
              <div style={{ 
                width: "60px", 
                fontSize: "11px", 
                color: "#94a3b8",
                textAlign: "right",
                paddingRight: "12px",
                fontWeight: "500"
              }}>
                {bucket.sizeRange}
              </div>
              
              {/* Stacked heatmap bar */}
              <div
                style={{
                  flex: 1,
                  height: "26px",
                  backgroundColor: "#374151",
                  border: "1px solid #4b5563",
                  borderRadius: "4px",
                  display: "flex",
                  overflow: "hidden",
                  position: "relative"
                }}
              >
                {/* 0.90 price portion */}
                {prop090 > 0 && (
                  <div
                    style={{
                      width: `${prop090 * 100}%`,
                      height: "100%",
                      backgroundColor: `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {bucket.priceBreakdown["0.90"] > 0 && prop090 > 0.3 && (
                      <span style={{ 
                        fontSize: "10px", 
                        color: "#ffffff",
                        fontWeight: "500"
                      }}>
                        {bucket.priceBreakdown["0.90"]}
                      </span>
                    )}
                  </div>
                )}
                
                {/* 0.95 price portion */}
                {prop095 > 0 && (
                  <div
                    style={{
                      width: `${prop095 * 100}%`,
                      height: "100%",
                      backgroundColor: `rgba(168, 85, 247, ${0.3 + intensity * 0.7})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {bucket.priceBreakdown["0.95"] > 0 && prop095 > 0.3 && (
                      <span style={{ 
                        fontSize: "10px", 
                        color: "#ffffff",
                        fontWeight: "500"
                      }}>
                        {bucket.priceBreakdown["0.95"]}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Total count overlay for small segments */}
                {(prop090 <= 0.3 || prop095 <= 0.3) && bucket.count > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: "8px",
                      color: "#e2e8f0",
                      fontSize: "10px",
                      fontWeight: "500"
                    }}
                  >
                    {bucket.count} trades
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Statistics */}
      <div style={{ 
        marginTop: "16px", 
        fontSize: "11px", 
        color: "#94a3b8",
        borderTop: "1px solid #334155",
        paddingTop: "12px"
      }}>
        <div style={{ marginBottom: "4px" }}>
          Total filtered trades: {totalTrades}
        </div>
        <div style={{ marginBottom: "4px" }}>
          At price 0.90: {tradesAt090} trades
        </div>
        <div style={{ marginBottom: "4px" }}>
          At price 0.95: {tradesAt095} trades
        </div>
        <div>Max in bucket: {maxCount}</div>
      </div>
    </div>
  );
}
