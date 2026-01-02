'use client'

import { useState } from 'react';
import { getRaceDetails, HorseDetail } from '../app/actions';

// Minimal Sparkline Component (Client Side)
function Sparkline({ data }: { data: { time: string; odds: number }[] }) {
    if (!data || data.length < 2) return null;

    const height = 30;
    const width = 80;
    const maxOdds = Math.max(...data.map(d => d.odds));
    const minOdds = Math.min(...data.map(d => d.odds));
    const range = maxOdds - minOdds || 1;

    // Normalize points
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        // High odds top? No, graph usually High Value Top. 
        // For odds, Low is "Better". But trend wise, a DROP is falling line.
        // Let's keep: Bottom = 0/Min, Top = Max.
        // So a drop in odds (10 -> 5) should go DOWN.
        // Screen Y: 0 is Top. 
        // Val 10 (Max) -> Y 0. Val 5 (Min) -> Y 30.
        // Formula: y = ((val - min) / range) * height (Normal) -> 0..height
        // We want Max at Top(0).
        // y = ((max - val) / range) * height.
        // If val = max(10) -> 0. If val = min(5) -> height.
        // A drop (10->5) will go from Top to Bottom. Correct visually for "Drop".
        const y = ((maxOdds - d.odds) / range) * height; // Max at Top
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="overflow-visible opacity-70">
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* End Dot */}
            <circle
                cx={width}
                cy={((maxOdds - data[data.length - 1].odds) / range) * height}
                r="2"
                fill="currentColor"
            />
        </svg>
    );
}

export default function RaceCard({ alert }: { alert: any }) {
    const [expanded, setExpanded] = useState(false);
    const [details, setDetails] = useState<HorseDetail[]>([]);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        if (!expanded && details.length === 0) {
            setLoading(true);
            try {
                const data = await getRaceDetails(alert.race_id, alert);
                setDetails(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        setExpanded(!expanded);
    };

    return (
        <div
            className={`group relative bg-white border border-gray-100 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] transition-all duration-500 ease-out overflow-hidden ${expanded ? 'ring-1 ring-primary/20' : 'hover:shadow-md'}`}
        >
            {/* Whale Indicator: Emerald Bar */}
            <div className={`absolute left-0 top-0 bottom-0 bg-primary transition-all duration-300 ${expanded ? 'w-1.5' : 'w-1 group-hover:w-1.5'}`} />

            {/* Main Clickable Area */}
            <div onClick={handleToggle} className="p-5 pl-7 cursor-pointer">
                {/* Header: Metadata */}
                <div className="flex items-baseline justify-between mb-3 text-gray-500 font-sans">
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                        <span className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs border border-gray-200">
                            {alert.location} {alert.race_number}R
                        </span>
                        <span>{alert.race_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <time className="text-[10px] sm:text-xs opacity-60 font-mono">
                            {new Date(alert.detected_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </time>
                        <span className={`text-xs text-gray-300 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>▼</span>
                    </div>
                </div>

                {/* Body: Core Info */}
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-xs text-gray-400 mb-0.5">{alert.horse_number}番</div>
                        <div className="text-xl sm:text-2xl font-bold text-gray-800 font-serif leading-none tracking-tight">
                            {alert.horse_name}
                        </div>
                    </div>

                    {/* Odds Change */}
                    <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                            {/* Chart for Main Alert */}
                            <div className="mb-1 text-emerald-600">
                                {alert.history && <Sparkline data={alert.history} />}
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-sm text-gray-400 line-through decoration-gray-300 decoration-1">
                                    {alert.previous_odds.toFixed(1)}
                                </span>
                                <span className="text-gray-300 text-sm">→</span>
                                <span className="text-2xl font-bold text-primary tabular-nums">
                                    {alert.current_odds.toFixed(1)}
                                </span>
                                <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-600 text-xs font-bold rounded border border-red-100 tabular-nums">
                                    {(alert.drop_rate * 100).toFixed(0)}% DOWN
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            <div className={`bg-gray-50/50 border-t border-gray-100 transition-all duration-500 overflow-hidden ${expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-4 pl-6 text-sm">
                    <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">All Runners</h4>

                    {loading ? (
                        <div className="text-center py-4 text-gray-400 text-xs">Loading race data...</div>
                    ) : (
                        <div className="space-y-0.5">
                            {details.map((horse) => (
                                <div
                                    key={horse.horse_number}
                                    className={`grid grid-cols-12 items-center py-2 px-2 rounded ${horse.is_alert ? 'bg-emerald-50/50' : 'hover:bg-gray-100/50'}`}
                                >
                                    {/* Num */}
                                    <div className={`col-span-1 font-mono text-center ${horse.is_alert ? 'text-primary font-bold' : 'text-gray-400'}`}>
                                        {horse.horse_number}
                                    </div>

                                    {/* Name Check: Scraper doesn't save all names. Show placeholder if missing. */}
                                    <div className="col-span-5 pl-2 text-gray-700">
                                        {horse.horse_name || <span className="text-gray-300 text-xs italic">Horse #{horse.horse_number}</span>}
                                    </div>

                                    {/* Sparkline */}
                                    <div className="col-span-3 h-6 flex items-center justify-center text-gray-400">
                                        {horse.history.length > 1 && <Sparkline data={horse.history} />}
                                    </div>

                                    {/* Odds */}
                                    <div className={`col-span-3 text-right font-mono ${horse.is_alert ? 'text-primary font-bold' : 'text-gray-600'}`}>
                                        {horse.current_odds.toFixed(1)}
                                    </div>
                                </div>
                            ))}
                            <div className="mt-4 text-center">
                                <a href="https://rakuten.co.jp" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-300 hover:text-primary transition-colors border-b border-gray-200 pb-0.5">
                                    楽天競馬で投票する ↗
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
