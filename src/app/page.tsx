import { createClient } from '@supabase/supabase-js';

// --- Types ---
type AnalysisData = {
  id: string;
  race_name: string;
  race_number: number;
  location: string;
  horse_name: string;
  horse_number: number;
  previous_odds: number;
  current_odds: number;
  drop_rate: number;
  detected_at: string;
};

// --- Mock Data (Fallback) ---
const MOCK_DATA: AnalysisData[] = [
  {
    id: '1',
    race_name: 'あずさ賞',
    race_number: 9,
    location: '京都',
    horse_name: 'エステティック',
    horse_number: 4,
    previous_odds: 12.0,
    current_odds: 9.4,
    drop_rate: 0.21,
    detected_at: new Date().toISOString(),
  },
  {
    id: '2',
    race_name: 'ヴィクトリアマイル(G1)',
    race_number: 11,
    location: '東京',
    horse_name: 'アーバンシック',
    horse_number: 12,
    previous_odds: 8.5,
    current_odds: 5.2,
    drop_rate: 0.38,
    detected_at: new Date().toISOString(),
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

  // Actual fetch logic matching the schema
  const { data, error } = await supabase
    .from('odds_analysis')
    .select(`
      *,
      races (
        race_name,
        race_number,
        location
      )
    `)
    .order('detected_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    console.log('Supabase fetch failed or empty, using mock data.');
    return MOCK_DATA;
  }

  // Flatten the structure for the UI
  return data.map((item: any) => ({
    id: item.id,
    race_name: item.races?.race_name || 'Race',
    race_number: item.races?.race_number || 0,
    location: item.races?.location || 'JRA',
    horse_name: item.horse_name,
    horse_number: item.horse_number,
    previous_odds: item.previous_odds,
    current_odds: item.current_odds,
    drop_rate: item.drop_rate,
    detected_at: item.detected_at,
  }));
}

export default async function Home() {
  const alerts = await getAnalysisData();

  return (
    <main className="min-h-screen text-foreground bg-background pb-20">

      {/* Hero Section */}
      <section className="pt-24 pb-12 px-6 text-center animate-in fade-in duration-1000">
        <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight mb-4 text-gray-900">
          Market Flow Analysis
        </h1>
        <p className="text-xs sm:text-sm font-sans tracking-[0.2em] text-gray-500 uppercase">
          Static Observation of Dynamic Odds
        </p>
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
                  <div className="text-xs text-gray-400 mb-1">Odds Flow</div>
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
