// src/App.tsx (only showing the relevant part)
import GpuScatterGrid, { type ChartData } from "./GpuScatterGrid";
import SizeHeatmap from "./SizeHeatmap";
import PriceFilteredSizeHeatmap from "./PriceFilteredSizeHeatmap";
import TradeAnalysis from "./TradeAnalysis";
import TradeAnalysis90 from "./TradeAnalysis90";
import markets from "./markets";
import type { Market } from "./markets";
import myTrades from "./trades_output";

interface ExtendedChartData extends ChartData {
  upAssetId: string;
  downAssetId: string;
}

interface MyTradeData {
  chartIndex: number;
  trades: {
    timestamp: number;
    price: number;
    outcome: string;
  }[];
}

function toCharts(ms: Market[]): { charts: ChartData[], myTradesData: MyTradeData[], extendedCharts: ExtendedChartData[] } {
  const extendedCharts: ExtendedChartData[] = ms.map((m) => {
    // Combine both up and down trades into a single points array with color info
    const upPoints = m.up.trades.map(t => ({ 
      x: t.timestamp, 
      y: t.price, 
      size: t.size,
      color: [0.9, 0.2, 0.2] as [number, number, number] // Red for up trades
    }));
    const downPoints = m.down.trades.map(t => ({ 
      x: t.timestamp, 
      y: t.price, 
      size: t.size,
      color: [0.2, 0.8, 0.2] as [number, number, number] // Green for down trades
    }));
    
    const allPoints = [...upPoints, ...downPoints];
    
    return {
      id: String(m.id),
      title: m.title,
      side: "Up" as const, // This field is required but not meaningful when combining both sides
      points: allPoints,
      color: [0.35, 0.52, 0.92] as [number, number, number], // Default color (won't be used for individual points)
      upAssetId: m.up.assetId,
      downAssetId: m.down.assetId,
    };
  });

  // Prepare myTrades data with chart associations
  const myTradesData = extendedCharts.map((chart, index) => {
    const myTradesForThisMarket = myTrades.filter(trade => 
      trade.assetId === chart.upAssetId || trade.assetId === chart.downAssetId
    );
    
    return {
      chartIndex: index,
      trades: myTradesForThisMarket.map(trade => ({
        timestamp: parseInt(trade.timeStamp),
        price: trade.price,
        outcome: trade.outcome,
      }))
    };
  }).filter(item => item.trades.length > 0);

  return { charts: extendedCharts, myTradesData, extendedCharts };
}

export default function App() {
  const { charts, myTradesData, extendedCharts } = toCharts(markets);
  return (
    <div style={{ 
      padding: 20, 
      backgroundColor: "#0f172a", 
      color: "#f1f5f9", 
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "24px"
    }}>
      <h1 style={{ 
        margin: "0 0 20px 0", 
        color: "#f1f5f9",
        fontSize: "24px",
        fontWeight: "600"
      }}>
        Market Trades Dashboard
      </h1>
      
      <div style={{ display: "flex", gap: "24px", flex: 1, width: "100%" }}>
        {/* Heatmap column */}
        <div style={{ 
          width: "350px", 
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <SizeHeatmap charts={charts} width={320} height={600} />
          <PriceFilteredSizeHeatmap charts={charts} width={320} height={600} />
        </div>
        
        {/* Charts section */}
        <div style={{ 
          flex: 1, // Take remaining space
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          overflow: "auto", // Allow scrolling if content is too tall
          minWidth: 0 // Allow flex item to shrink below content size
        }}>
          {/* Trade Analysis at the top */}
          <TradeAnalysis charts={extendedCharts} />
          
          {/* Trade Analysis for $0.90 trades */}
          <TradeAnalysis90 charts={extendedCharts} />
          
          {/* Individual charts */}
          <div style={{ 
            backgroundColor: "#1e293b",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <h2 style={{ 
              margin: "0 0 16px 0", 
              color: "#f1f5f9",
              fontSize: "18px",
              fontWeight: "500"
            }}>
              Individual Market Trades (Up & Down combined)
            </h2>
            <GpuScatterGrid
              charts={charts}
              columns={6}
              cellHeight={280}
              cellGap={20}
              pointSizeRange={[2, 12]}
              myTradesData={myTradesData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
