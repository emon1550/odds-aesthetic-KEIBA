import os
import sys
import datetime
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import tweepy
import time

# --- Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TWITTER_API_KEY = os.environ.get("TWITTER_API_KEY")
TWITTER_API_SECRET = os.environ.get("TWITTER_API_SECRET")
TWITTER_ACCESS_TOKEN = os.environ.get("TWITTER_ACCESS_TOKEN")
TWITTER_ACCESS_SECRET = os.environ.get("TWITTER_ACCESS_SECRET")

# Timezone: JST
JST = datetime.timezone(datetime.timedelta(hours=9))

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Supabase credentials not found.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_twitter_client():
    if not (TWITTER_API_KEY and TWITTER_API_SECRET and TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_SECRET):
        # Fail silently or just print warning
        return None
    
    return tweepy.Client(
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_SECRET
    )

def scrape_race_odds(rid, current_time):
    """
    Scrapes odds for a single race ID. returns list of dicts.
    """
    odds_url = f"https://race.netkeiba.com/odds/index.html?race_id={rid}"
    try:
        r_odds = requests.get(odds_url, timeout=10)
        s_odds = BeautifulSoup(r_odds.content, "html.parser")
    except Exception as e:
        print(f"[{rid}] Fetch error: {e}")
        return [], None

    # Find Race Name/Info for Tweet
    try:
        r_title = s_odds.select_one(".RaceName").get_text(strip=True)
    except:
        r_title = f"Race {rid}"

    # Extract Odds Data
    data = []
    rows = s_odds.select("#Odds_Design_Table tr.HorseList")
    for row in rows:
        try:
            h_num_elem = row.select_one(".Waku") 
            h_name_elem = row.select_one(".Horse_Name")
            odds_elem = row.select_one(".Odds") 
            
            if not (h_num_elem and h_name_elem and odds_elem):
                continue
                
            h_num = int(h_num_elem.get_text(strip=True))
            h_name = h_name_elem.get_text(strip=True)
            odds_text = odds_elem.get_text(strip=True)
            
            if not odds_text or odds_text == "---":
                continue
                
            current_odds = float(odds_text)
            data.append({
                "horse_number": h_num,
                "horse_name": h_name,
                "current_odds": current_odds
            })
        except:
            pass
    
    return data, r_title

def check_and_alert(rid, data, r_title, supabase, twitter):
    """
    Compares current odds with DB snapshots and alerts if dropped.
    """
    if not data: return

    for horse in data:
        # Fetch previous snapshot (Mocking logic for MVP: in prod, use race_id UUID)
        # Using a simple logic: Check latest snapshot for this race_id + horse_num
        # We need to find the internal UUID of the race first. 
        # For efficiency in this loop, we might want to cache the race UUID.
        
        # 1. Get Race UUID (create if not exists or assume seed_data)
        # For MVP: We skip complex DB sync and assume we can query by some key or just insert analysis directly.
        # Let's try to query 'races' by external_id={rid}
        
        # NOTE: Proper implementation requires 'races' table sync. 
        # Here we do a simplified check: Just Insert to snapshots and Compare.
        
        # Need to fix the Relation: id (UUID) <-> rid (String like 2024...)
        # Assume 'races' has external_id.
        
        # Fetch or Create Race
        race_res = supabase.table('races').select('id').eq('external_id', rid).execute()
        race_uuid = None
        if race_res.data:
            race_uuid = race_res.data[0]['id']
        else:
            # Create race placeholder
            # Need to parse details, but for MVP let's insert minimal
            new_race = {
                "external_id": rid,
                "race_date": datetime.datetime.now().strftime("%Y-%m-%d"), 
                "location": "JRA", # Should parse
                "race_number": 0,  # Should parse
                "start_time": datetime.datetime.now().isoformat() # Dummy
            }
            res = supabase.table('races').insert(new_race).execute()
            if res.data: race_uuid = res.data[0]['id']

        if not race_uuid: continue

        # 2. Get Last Snapshot
        snap_res = supabase.table('odds_snapshots')\
            .select('odds')\
            .eq('race_id', race_uuid)\
            .eq('horse_number', horse['horse_number'])\
            .order('fetched_at', desc=True)\
            .limit(1)\
            .execute()
            
        previous_odds = None
        if snap_res.data:
            previous_odds = snap_res.data[0]['odds']

        # 3. Detect Drop
        if previous_odds:
            if previous_odds > 0:
                drop_rate = (previous_odds - horse['current_odds']) / previous_odds
                if drop_rate >= 0.2: # 20% drop
                    print(f"ALERT: {horse['horse_name']} {previous_odds} -> {horse['current_odds']}")
                    
                    # Record Analysis
                    supabase.table('odds_analysis').insert({
                        "race_id": race_uuid,
                        "horse_number": horse['horse_number'],
                        "horse_name": horse['horse_name'],
                        "previous_odds": previous_odds,
                        "current_odds": horse['current_odds'],
                        "drop_rate": drop_rate
                    }).execute()

                    # Tweet
                    if twitter:
                        msg = f"【急落検知】\n{r_title} {horse['horse_number']}番 {horse['horse_name']}\n{previous_odds} → {horse['current_odds']} (▼{drop_rate*100:.1f}%)\n#JRA #競馬 #OddsAesthetic"
                        try:
                            twitter.create_tweet(text=msg)
                        except: pass

        # 4. Save Snapshot (Always, for next comparison)
        supabase.table('odds_snapshots').insert({
            "race_id": race_uuid,
            "horse_number": horse['horse_number'],
            "odds": horse['current_odds']
        }).execute()


def main():
    now = datetime.datetime.now(JST)
    date_str = now.strftime("%Y%m%d")
    
    print(f"--- Run at {now} ---")

    # 1. Fetch Race List
    list_url = f"https://race.netkeiba.com/top/race_list.html?kaisai_date={date_str}"
    try:
        resp = requests.get(list_url)
        soup = BeautifulSoup(resp.content, "html.parser")
    except Exception as e:
        print(e)
        sys.exit(0)

    # 2. Extract Races & Times
    # We need to find race start times to filter.
    # Netkeiba structure: .RaceList_Data .RaceList_Item ... .RaceTime
    
    candidates = [] # Races we want to process
    urgent_races = [] # Races starting in < 2 mins (Burst Mode)
    
    # Simple iteration over race links
    race_items = soup.select(".RaceList_DataItem")
    
    for item in race_items:
        try:
            # Extract ID
            link = item.select_one("a")
            if not link: continue
            href = link.get("href")
            rid = href.split("race_id=")[1].split("&")[0]
            
            # Filter: Exclude Jump Races (障害レース)
            # Netkeiba usually has .RaceData01 with text like "芝1600m" or "障3000m"
            race_data_node = item.select_one(".RaceData01")
            if race_data_node:
                r_txt = race_data_node.get_text(strip=True)
                if "障" in r_txt:
                    # print(f"Skipping Jump Race: {rid}")
                    continue

            # Extract Time (e.g., "10:30")
            time_elem = item.select_one(".RaceTime")
            if not time_elem: continue
            time_str = time_elem.get_text(strip=True)
            
            # Parse Time
            # time_str is HH:MM. Join with today's date
            # Handling 10:00 vs 09:55
            dst_dt = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H:%M").replace(tzinfo=JST)
            
            # Logic:
            # Window starts: 15 mins before race
            # Window ends: Race Start (0 mins before)
            
            time_diff = (dst_dt - now).total_seconds() / 60.0 # minutes
            
            # Condition: If we are in [Start-15min, Start]
            if 0 < time_diff <= 15:
                candidates.append(rid)
                
                # Burst Condition: Last 5 mins (Expanded as requested)
                # Note: This increases Action minutes usage.
                if time_diff <= 5.0: 
                    urgent_races.append({
                        "rid": rid,
                        "start_time": dst_dt
                    })
                    
        except Exception as e:
            # print(f"Parse error: {e}")
            pass

    print(f"Candidates (15-0 min): {len(candidates)}")
    print(f"Urgent (Last 2 min): {len(urgent_races)}")

    if not candidates:
        print("No active races. Exiting.")
        return

    supabase = get_supabase()
    twitter = get_twitter_client()

    # 3. Strategy Execution
    
    # A) Immediate Fetch for ALL Candidates (Covers the 'Every 2 mins' requirement efficiently)
    # Since we run every 5 mins, fetching once ensures reasonably fresh data for the 15-min window.
    for rid in candidates:
        print(f"Fetching normal: {rid}")
        data, title = scrape_race_odds(rid, now)
        check_and_alert(rid, data, title, supabase, twitter)

    # B) Burst Mode for Urgent Races
    # If a race is starting soon, we stick around and poll until it starts.
    if urgent_races:
        print(">>> Entering Burst Mode <<<")
        # Loop until the latest start time in urgent_races passes
        # Max loop duration cap: 120 seconds to prevent overrun
        start_loop = time.time()
        
        while True:
            # Check timeout
            if time.time() - start_loop > 120: 
                print("Burst timeout.")
                break
                
            active_urgent = [r for r in urgent_races if (r['start_time'] - datetime.datetime.now(JST)).total_seconds() > 0]
            if not active_urgent:
                print("All races started.")
                break
                
            for ur in active_urgent:
                print(f"BURST Fetch: {ur['rid']}")
                data, title = scrape_race_odds(ur['rid'], now)
                check_and_alert(ur['rid'], data, title, supabase, twitter)
            
            time.sleep(10) # 10 sec interval for Real-time (Active/Aggressive)

if __name__ == "__main__":
    main()
