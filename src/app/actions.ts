'use server'

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export type HorseDetail = {
    horse_number: number;
    horse_name?: string; // Snapshot might not have name depending on schema, but analysis does. 
    // Actually scraper saves name in analysis, but snapshot only has odds.
    // We might need to mock name or accept missing name for non-alert horses if not stored.
    // WAIT: scraper.py only inserts name in 'odds_analysis'. 'odds_snapshots' has no name.
    // This is a schema limitation for the "Full List".
    // GAP: We don't have descriptions for non-alert horses in DB.
    // FIX for MVP: We will display "Horse #N" for non-alert horses, or 
    // we try to join with something?
    // Let's check schema. 'odds_snapshots' links to 'races'. No horse table.
    // Scraper only knew name from scraping.
    // MVP Solution: Just show Horse Number and Odds for others. 
    // Alerted horses will have names merged.
    current_odds: number;
    history: { time: string; odds: number }[];
    is_alert: boolean;
    drop_rate?: number;
};

export async function getRaceDetails(raceId: string, alertData: any): Promise<HorseDetail[]> {
    if (!supabase) return [];

    // 1. Get all snapshots for this race
    // We want the LATEST snapshot for EACH horse.
    // And we want history for charts.

    // Strategy: Fetch ALL snapshots for the race (limit 500?), then process in JS.
    const { data: snapshots } = await supabase
        .from('odds_snapshots')
        .select('horse_number, odds, fetched_at')
        .eq('race_id', raceId)
        .order('fetched_at', { ascending: true })
        .limit(1000);

    if (!snapshots) return [];

    // Group by Horse
    const horseMap = new Map<number, { time: string; odds: number }[]>();

    snapshots.forEach((snap: any) => {
        if (!horseMap.has(snap.horse_number)) {
            horseMap.set(snap.horse_number, []);
        }
        horseMap.get(snap.horse_number)?.push({
            time: new Date(snap.fetched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
            odds: snap.odds
        });
    });

    // Convert to Array
    const result: HorseDetail[] = [];

    // Alert data lookup for Names and Drop Rates
    // alertData is the single alert object passed from parent
    // But a race might have MULTIPLE alerts? 
    // The current UI page.tsx maps 'alerts'. 
    // If we expand an alert card, we are showing THAT race.
    // There might be other alerts in the same race.

    // Let's iterate 1..18 (standard max horses) or just keys in map
    const horseNumbers = Array.from(horseMap.keys()).sort((a, b) => a - b);

    for (const hNum of horseNumbers) {
        const hist = horseMap.get(hNum) || [];
        const latest = hist[hist.length - 1];

        // Check if this horse matches the current alert context
        const isTargetAlert = (hNum === alertData.horse_number);

        result.push({
            horse_number: hNum,
            horse_name: isTargetAlert ? alertData.horse_name : undefined, // Only have name for the alert
            current_odds: latest.odds,
            history: hist,
            is_alert: isTargetAlert,
            drop_rate: isTargetAlert ? alertData.drop_rate : undefined
        });
    }

    return result;
}
