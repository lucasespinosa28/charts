// src/TradeAnalysis.tsx
import { useMemo } from 'react';
import myTrades from './trades_output';

interface TradeAnalysisData {
  assetId: string;
  tradePrice: number;
  tradeTimestamp: number;
  outcome: 'Yes' | 'No';
  lowestPriceAfterTrade: number;
  lowestPriceTimestamp: number;
  percentageSavings?: number;
  chartTitle: string;
}

interface Props {
  charts: Array<{
    id: string;
    title: string;
    upAssetId?: string;
    downAssetId?: string;
    points: Array<{
      x: number; // timestamp
      y: number; // price
      size?: number;
      color?: [number, number, number];
    }>;
  }>;
  targetPrice: number;
}

export default function TradeAnalysis({ charts, targetPrice }: Props) {
  const priceLabel = `$${targetPrice.toFixed(2)}`;
  const analysisData = useMemo(() => {
    const results: TradeAnalysisData[] = [];

    // Filter trades to only include trades at the target price
    const filteredTrades = myTrades.filter(trade => trade.price === targetPrice);

    filteredTrades.forEach(trade => {
      // Convert timeStamp string to number
      const tradeTimestamp = parseInt(trade.timeStamp);
      
      // Find charts that contain this trade's assetId (either as up or down asset)
      const matchingCharts = charts.filter(chart => 
        chart.upAssetId === trade.assetId || chart.downAssetId === trade.assetId
      );

      let totalMarkets = 0;
      let lowestPriceFound: number | null = null;
      let lowestPriceTimestamp: number | null = null;
      let chartTitle = '';

      matchingCharts.forEach(chart => {
        chartTitle = chart.title; // Get the chart title
        
        // Determine which asset's price movements to analyze based on the trade's assetId
        let relevantPoints: Array<{x: number, y: number, size?: number, color?: [number, number, number]}> = [];
        
        if (chart.upAssetId === trade.assetId) {
          // This trade was for the "up" asset, so look at up points (red points)
          relevantPoints = chart.points.filter(point => 
            point.color && point.color[0] > 0.8 && point.color[1] < 0.3 // Red points (up trades)
          );
        } else if (chart.downAssetId === trade.assetId) {
          // This trade was for the "down" asset, so look at down points (green points)
          relevantPoints = chart.points.filter(point => 
            point.color && point.color[1] > 0.7 && point.color[0] < 0.3 // Green points (down trades)
          );
        }
        
        // Get points after the trade timestamp that are above a reasonable trading threshold (10 cents)
        const futurePoints = relevantPoints.filter(point => 
          point.x > tradeTimestamp && point.y >= 0.10
        );
        
        if (futurePoints.length > 0) {
          totalMarkets++;
          
          // Find the lowest realistic price after the trade
          const lowestPoint = futurePoints.reduce((min, point) => 
            point.y < min.y ? point : min
          );
          
          // Track the overall lowest realistic price found across all charts
          if (lowestPriceFound === null || lowestPoint.y < lowestPriceFound) {
            lowestPriceFound = lowestPoint.y;
            lowestPriceTimestamp = lowestPoint.x;
          }
        }
      });

      if (totalMarkets > 0 && lowestPriceFound !== null && lowestPriceTimestamp !== null) {
        const percentageSavings = lowestPriceFound < trade.price ? 
          ((trade.price - lowestPriceFound) / trade.price) * 100 : 0;
        
        results.push({
          tradePrice: trade.price,
          tradeTimestamp: tradeTimestamp,
          assetId: trade.assetId,
          outcome: trade.outcome as 'Yes' | 'No',
          lowestPriceAfterTrade: lowestPriceFound,
          lowestPriceTimestamp,
          percentageSavings,
          chartTitle
        });
      }
    });

    return results.sort((a, b) => b.tradeTimestamp - a.tradeTimestamp); // Most recent first
  }, [charts, targetPrice]);

  const overallStats = useMemo(() => {
    if (analysisData.length === 0) return { averageSavings: 0, totalTrades: 0 };
    
    const totalSavings = analysisData.reduce((sum, trade) => sum + (trade.percentageSavings || 0), 0);
    return {
      averageSavings: totalSavings / analysisData.length,
      totalTrades: analysisData.length
    };
  }, [analysisData]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatPrice = (price: number) => `$${price.toFixed(3)}`;

  if (analysisData.length === 0) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        marginBottom: '20px'
      }}>
        <h3 style={{ color: '#f1f5f9', margin: '0 0 10px 0', fontSize: '16px' }}>
          Trade Analysis - {priceLabel} Trades (Realistic Prices ≥ $0.10)
        </h3>
        <p style={{ color: '#94a3b8', margin: 0 }}>
          No trades at {priceLabel} found with matching market data.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#1e293b',
      borderRadius: '8px',
      border: '1px solid #334155',
      marginBottom: '20px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h3 style={{ color: '#f1f5f9', margin: 0, fontSize: '18px', fontWeight: 600 }}>
          Trade Analysis - {priceLabel} Trades (Realistic Prices ≥ $0.10)
        </h3>
        <div style={{ 
          display: 'flex', 
          gap: '20px',
          fontSize: '14px'
        }}>
          <div style={{ 
            textAlign: 'center',
            padding: '8px 12px',
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            border: '1px solid #334155'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>Average Potential Savings</div>
            <div style={{ 
              color: overallStats.averageSavings >= 5 ? '#ef4444' : '#22c55e',
              fontWeight: 600,
              fontSize: '16px'
            }}>
              {overallStats.averageSavings.toFixed(2)}%
            </div>
          </div>
          <div style={{ 
            textAlign: 'center',
            padding: '8px 12px',
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            border: '1px solid #334155'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>Total Trades</div>
            <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '16px' }}>
              {overallStats.totalTrades}
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '12px',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        {analysisData.map((trade, index) => (
          <div
            key={`${trade.assetId}-${trade.tradeTimestamp}-${index}`}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '13px'
            }}
          >
            {/* Trade Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <div style={{ 
                color: '#f1f5f9',
                fontWeight: 600,
                fontSize: '14px'
              }}>
                {formatPrice(trade.tradePrice)}
              </div>
              <div style={{ 
                fontSize: '11px',
                color: '#64748b'
              }}>
                {formatTime(trade.tradeTimestamp)}
              </div>
            </div>

            {/* Outcome Badge */}
            <div style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: trade.outcome === 'Yes' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: trade.outcome === 'Yes' ? '#22c55e' : '#ef4444',
              fontSize: '11px',
              fontWeight: 500,
              marginBottom: '8px'
            }}>
              {trade.outcome}
            </div>

            {/* Chart Title */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '6px 8px',
              borderRadius: '4px',
              marginBottom: '8px',
              border: '1px solid #334155'
            }}>
              <div style={{ 
                color: '#94a3b8', 
                fontSize: '10px',
                marginBottom: '2px' 
              }}>
                Market
              </div>
              <div style={{ 
                color: '#f1f5f9', 
                fontSize: '11px',
                lineHeight: '1.3'
              }}>
                {trade.chartTitle}
              </div>
            </div>

            {/* Analysis Results */}
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderTop: '1px solid #334155'
            }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                  Lowest Realistic Price After Trade
                </div>
                <div style={{ color: '#f1f5f9', fontWeight: 600 }}>
                  {formatPrice(trade.lowestPriceAfterTrade)}
                </div>
                <div style={{ color: '#64748b', fontSize: '10px' }}>
                  at {formatTime(trade.lowestPriceTimestamp)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  color: (trade.percentageSavings || 0) > 0 ? '#ef4444' : '#22c55e',
                  fontWeight: 600,
                  fontSize: '16px'
                }}>
                  {(trade.percentageSavings || 0).toFixed(2)}%
                </div>
                <div style={{ color: '#64748b', fontSize: '10px' }}>
                  potential savings
                </div>
              </div>
            </div>

            {/* Asset ID (truncated) */}
            <div style={{ 
              fontSize: '10px',
              color: '#64748b',
              marginTop: '4px',
              fontFamily: 'monospace'
            }}>
              {trade.assetId.substring(0, 16)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
