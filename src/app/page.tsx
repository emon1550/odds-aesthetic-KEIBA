import { createClient } from '@supabase/supabase-js';

// --- Types ---
type AnalysisData = {
  id: string;
  race_id: string; // Needed for history fetch
  race_name: string;
  race_number: number;
  location: string;
  horse_name: string;
  horse_number: number;
  previous_odds: number;
  current_odds: number;
  drop_rate: number;
  detected_at: string;
  history?: { time: string; odds: number }[]; // For Chart
};

// --- Mock Data (Fallback) ---
const MOCK_DATA: AnalysisData[] = [
  {
    id: '1',
    race_id: 'mock1',
    race_name: 'あずさ賞',
    race_number: 9,
    location: '京都',
    horse_name: 'エステティック',
    horse_number: 4,
    previous_odds: 12.0,
    current_odds: 9.4,
    drop_rate: 0.21,
    detected_at: new Date().toISOString(),
    history: [
      { time: '10:00', odds: 13.5 },
      { time: '10:05', odds: 12.0 },
      { time: '10:10', odds: 11.2 },
      { time: '10:15', odds: 9.4 },
    ]
  },
  {
    id: '2',
    race_id: 'mock2',
    race_name: 'ヴィクトリアマイル(G1)',
    race_number: 11,
    location: '東京',
    horse_name: 'アーバンシック',
    horse_number: 12,
    previous_odds: 8.5,
    current_odds: 5.2,
    drop_rate: 0.38,
    detected_at: new Date().toISOString(),
    history: [
      { time: '14:30', odds: 9.0 },
      { time: '14:40', odds: 8.5 },
      { time: '14:45', odds: 7.0 },
      { time: '14:50', odds: 5.2 },
    ]
  },
];

// --- Supabase Client ---
// Note: In a real environment, use process.env.NEXT_PUBLIC_SUPABASE_URL etc.
// For this MVP code, we'll try to use the vars if available, else mock.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

async function getAnalysisData(): Promise<AnalysisData[]> {
  if (!supabase) return MOCK_DATA;

  // 1. Fetch Alerts
  const { data: alerts, error } = await supabase
    .from('odds_analysis')
    .select(`
      *,
      races (
        id,
        race_name,
        race_number,
        location
      )
    `)
    .order('detected_at', { ascending: false })
    .limit(20);

  if (error || !alerts || alerts.length === 0) {
    console.log('Supabase fetch failed or empty, using mock data.');
    return MOCK_DATA;
  }

  // 2. Fetch History for each alert (Parallel)
  const populatedData = await Promise.all(alerts.map(async (item: any) => {
    // Fetch snapshots for this horse/race
    // Limit to last 10 points for cleanliness
    const { data: hist } = await supabase
      .from('odds_snapshots')
      .select('odds, fetched_at')
      .eq('race_id', item.races?.id)
      .eq('horse_number', item.horse_number)
      .order('fetched_at', { ascending: true })
      .limit(20); // Get recent points

    const history = hist?.map((h: any) => ({
      time: new Date(h.fetched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      odds: h.odds
    })) || [];

    return {
      id: item.id,
      race_id: item.races?.id,
      race_name: item.races?.race_name || 'Race',
      race_number: item.races?.race_number || 0,
      location: item.races?.location || 'JRA',
      horse_name: item.horse_name,
      horse_number: item.horse_number,
      previous_odds: item.previous_odds,
      current_odds: item.current_odds,
      drop_rate: item.drop_rate,
      detected_at: item.detected_at,
      history: history
    };
  }));

  return populatedData;
}

// Minimal Sparkline Component
function Sparkline({ data }: { data: { time: string; odds: number }[] }) {
  if (!data || data.length < 2) return null;

  const height = 40;
  const width = 120;
  const maxOdds = Math.max(...data.map(d => d.odds));
  const minOdds = Math.min(...data.map(d => d.odds));
  const range = maxOdds - minOdds || 1;

  // Normalize points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    // Invert Y because lower odds is 'better' or just standard chart (higher Y = higher Val)
    // Usually charts: Higher Y = Higher Value (Top).
    // Let's draw standard: Higher Odds at Top.
    const y = height - ((d.odds - minOdds) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-end">
      <svg width={width} height={height} className="overflow-visible">
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#065F46"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-80"
        />
        {/* End Dot */}
        <circle
          cx={width}
          cy={height - ((data[data.length - 1].odds - minOdds) / range) * height}
          r="2.5"
          fill="#065F46"
        />
      </svg>
    </div>
  );
}

export default async function Home() {
  const alerts = await getAnalysisData();

  return (
    <main className="min-h-screen text-foreground bg-background pb-20">

      {/* Hero Section */}
      <section className="pt-24 pb-8 px-6 text-center animate-in fade-in duration-1000">
        <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight mb-4 text-gray-900">
          Market Flow Analysis
        </h1>
        <p className="text-xs sm:text-sm font-sans tracking-[0.2em] text-gray-500 uppercase mb-8">
          Static Observation of Dynamic Odds
        </p>
      </section>

      {/* Concept & Guide Section */}
      <section className="max-w-xl mx-auto px-6 mb-12 animate-in slide-in-from-bottom-4 duration-1000 delay-300">
        <div className="bg-white/50 backdrop-blur-sm border border-gray-100 p-6 sm:p-8 shadow-sm rounded-sm">
          <h2 className="text-center font-serif text-lg text-gray-800 mb-6 tracking-widest">
            - 哲学と使用法 -
          </h2>

          <div className="space-y-6 text-sm text-gray-600 font-sans leading-relaxed">
            <div>
              <h3 className="font-bold text-gray-900 mb-1 inline-block border-b border-primary/30 pb-0.5">What is this?</h3>
              <p className="mt-1">
                JRA全レースのオッズを「ラスト5分」までリアルタイム監視し、
                単勝オッズが20%以上急落した瞬間（＝大口投票/スマートマネーの流入）を検知･記録するシステムです。
              </p>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-1 inline-block border-b border-primary/30 pb-0.5">How to use</h3>
              <ul className="list-disc list-outside pl-4 space-y-1 mt-1">
                <li>
                  <span className="font-medium text-emerald-700">Emerald Bar</span>:
                  異常検知された馬には左側に緑色のバーが表示されます。
                </li>
                <li>
                  <span className="font-medium text-emerald-700">Sparkline</span>:
                  オッズがいつ、どのように落ちたかの推移をチャートで確認できます。
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-1 inline-block border-b border-primary/30 pb-0.5">Why it matters</h3>
              <p className="mt-1">
                締め切り直前の不可解なオッズ低下は、一般ファンが意識していない
                「確信度の高い情報」や「AIのシステム買い」を示唆する場合が多く、
                穴馬発見の強力なシグナルとなります。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Analysis Timeline */}
      <section className="max-w-xl mx-auto px-4 space-y-6">
        <div className="flex items-center justify-between px-2 mb-8">
          <span className="text-xs text-gray-400 font-mono">{new Date().toLocaleDateString('ja-JP')}</span>
          <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
            System Active
          </span>
        </div>

        {alerts.map((alert, index) => (
          <div
            key={alert.id}
            className="group relative bg-white border border-gray-100 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-500 ease-out overflow-hidden"
            style={{ animationDelay: `${index * 150}ms` }}
          >
            {/* Whale Indicator: Emerald Bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary group-hover:w-1.5 transition-all duration-300" />

            <div className="p-5 pl-7">
              {/* Header: Metadata */}
              <div className="flex items-baseline justify-between mb-3 text-gray-500 font-sans">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <span className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs border border-gray-200">
                    {alert.location} {alert.race_number}R
                  </span>
                  <span>{alert.race_name}</span>
                </div>
                <time className="text-[10px] sm:text-xs opacity-60 font-mono">
                  {new Date(alert.detected_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>

              {/* Body: Core Info */}
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">#{alert.horse_number}</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-800 font-serif leading-none tracking-tight">
                    {alert.horse_name}
                  </div>
                </div>

                {/* Odds Change */}
                <div className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    {/* Chart */}
                    <div className="mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
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
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Design Element: Subtle Noise/Texture Overlay could go here if needed */}
          </div>
        ))}

        {/* Empty State */}
        {alerts.length === 0 && (
          <div className="text-center py-20 opacity-50 font-serif">
            <p>No significant flow detected yet.</p>
          </div>
        )}

      </section>

      {/* Monetization / Footer Link */}
      <footer className="mt-24 text-center">
        <a
          href="#"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors duration-300 border-b border-transparent hover:border-primary/30 pb-0.5"
        >
          <span>📲</span>
          <span className="tracking-wide">このデータを地方競馬アプリで活用する</span>
          <span className="text-[10px] align-top">↗</span>
        </a>
      </footer>

    </main>
  );
}
