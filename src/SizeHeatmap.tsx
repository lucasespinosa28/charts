import { useMemo } from "react";
import type { ChartData } from "./GpuScatterGrid";

type SizeBucket = {
  sizeRange: string;
  count: number;
  minSize: number;
  maxSize: number;
};

type Props = {
  charts: ChartData[];
  width?: number;
  height?: number;
};

export default function SizeHeatmap({ charts, width = 300, height = 600 }: Props) {
  // Process all trade sizes and create buckets
  const sizeBuckets = useMemo(() => {
    // Collect all sizes from all charts
    const allSizes: number[] = [];
    charts.forEach(chart => {
      chart.points.forEach(point => {
        if (point.size && point.size > 0) {
          allSizes.push(point.size);
        }
      });
    });

    if (allSizes.length === 0) return [];

    // Find the maximum size to determine how many buckets we need
    const maxSize = Math.max(...allSizes);
    
    // Create fixed size buckets: 0-5, 5-10, 10-15, 15-20, etc.
    const buckets: SizeBucket[] = [];
    const bucketSize = 5;
    
    // Calculate number of buckets needed (up to max size, rounded up)
    const numBuckets = Math.ceil(maxSize / bucketSize);
    
    for (let i = 0; i < numBuckets; i++) {
      const bucketMinSize = i * bucketSize;
      const bucketMaxSize = (i + 1) * bucketSize;
      
      const count = allSizes.filter(size => size >= bucketMinSize && size < bucketMaxSize).length;
      
      // Only include buckets that have trades
      if (count > 0) {
        buckets.push({
          sizeRange: `${bucketMinSize}-${bucketMaxSize}`,
          count,
          minSize: bucketMinSize,
          maxSize: bucketMaxSize
        });
      }
    }

    return buckets;
  }, [charts]);

  const maxCount = Math.max(...sizeBuckets.map(b => b.count));

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
        Trade Size Distribution
      </h3>
      
      <div style={{ height: height - 120, overflowY: "auto" }}>
        {sizeBuckets.map((bucket, index) => {
          const intensity = bucket.count / maxCount;
          const cellHeight = 28;
          
          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "3px",
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
              
              {/* Heatmap bar */}
              <div
                style={{
                  flex: 1,
                  height: "22px",
                  backgroundColor: `rgba(34, 197, 94, ${0.15 + intensity * 0.85})`,
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: "8px",
                  color: intensity > 0.6 ? "#ffffff" : "#e2e8f0",
                  fontWeight: "500",
                }}
              >
                {bucket.count > 0 && (
                  <span style={{ fontSize: "11px" }}>
                    {bucket.count} trades
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div style={{ 
        marginTop: "16px", 
        fontSize: "11px", 
        color: "#94a3b8",
        borderTop: "1px solid #334155",
        paddingTop: "12px"
      }}>
        <div style={{ marginBottom: "4px" }}>
          Total trades: {sizeBuckets.reduce((sum, b) => sum + b.count, 0)}
        </div>
        <div>Max in bucket: {maxCount}</div>
      </div>
    </div>
  );
}
