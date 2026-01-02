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
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use Service Role for backend writes
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
        print("Warning: Twitter credentials not found. Skipping tweet.")
        return None
    
    client = tweepy.Client(
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_SECRET
    )
    return client

def main():
    now = datetime.datetime.now(JST)
    date_str = now.strftime("%Y%m%d")
    
    # --- 1. Construct URL & Check Existence ---
    # Example URL pattern for Netkeiba's race list (dummy pattern for MVP)
    # Real scraping often requires more complex navigation or specific IDs.
    # For this MVP, we will attempt top-level access.
    # NOTE: Netkeiba URLs usually need 'kaisai_date'.
    list_url = f"https://race.netkeiba.com/top/race_list.html?kaisai_date={date_str}"
    
    print(f"Checking URL: {list_url}")
    try:
        resp = requests.get(list_url)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")
    except Exception as e:
        print(f"Error fetching race list: {e}")
        sys.exit(1)

    # Simple check: If no race data block is found, assume no racing today.
    # Netkeiba usually lists races in #RaceTopRace class or similar.
    # Adjust selector based on actual site structure.
    if not soup.find_all(class_="RaceList_Data"): 
        print("No races found for today. Exiting.")
        sys.exit(0)

    supabase = get_supabase()
    twitter = get_twitter_client()

    # --- 2. Iterate Races & Scrape Odds ---
    # This is a simplified logic. In a real scraper, we'd parse the race IDs first.
    # Let's assume we can extract race IDs (e.g., '202405010101') from links.
    
    # Pseudo-selector for race links
    race_links = soup.select(".RaceList_Data a")
    race_ids = []
    for link in race_links:
        href = link.get('href', '')
        if 'race_id' in href:
            # Extract ID from parameter or path
            # href example: ../race/shutuba.html?race_id=202406010101
            try:
                rid = href.split('race_id=')[1].split('&')[0]
                race_ids.append(rid)
            except:
                pass
    
    race_ids = sorted(list(set(race_ids)))
    print(f"Found {len(race_ids)} races.")

    for rid in race_ids:
        # Check start time (mock logic: real scraper needs to parse time from page)
        # For MVP, we skip this granular check or fetch it from the race page.
        
        # Fetch Odds Page
        # https://race.netkeiba.com/odds/index.html?race_id=...
        odds_url = f"https://race.netkeiba.com/odds/index.html?race_id={rid}"
        try:
            r_odds = requests.get(odds_url)
            s_odds = BeautifulSoup(r_odds.content, "html.parser")
        except:
            continue

        # Extract Race Info & Status to ensure it hasn't started
        # ... (Implementation of date parsing omitted for brevity, assuming valid)
        
        # Scrape Horses and Odds
        # Selector needs to be fitted to actual HTML
        # Example: .Odds_Table tr
        rows = s_odds.select("#Odds_Design_Table tr.HorseList")
        
        for row in rows:
            try:
                h_num_elem = row.select_one(".Waku") # Logic for number
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
                
                # --- 3. Logic: Compare with Previous ---
                # Retrieve last snapshot from Supabase
                # SELECT * FROM odds_snapshots WHERE race_ext_id = rid AND horse_number = h_num ORDER BY fetched_at DESC LIMIT 1
                
                # Since we don't have race_uuid mapping easily without syncing 'races' table first,
                # we will use the external_id pattern or just simple logic for this file.
                # Ideally: Sync Race -> Get UUID -> Insert Snapshot.
                
                # For this script's brevity/MVP, we'll try to get the last snapshot by matching metadata if possible, 
                # or assume 'races' table is populated. 
                # Let's assume we do a quick lookup or just fetch based on raw query if possible (or skip and just log).
                
                # FETCH LAST SNAPSHOT (Pseudo-code for Supabase select)
                # In real prod, use the race info to find the 'races' record ID first.
                
                # Mocking the previous value fetch for compilation:
                previous_odds = None
                # response = supabase.table('odds_snapshots').select('odds').eq('external_race_id', rid).eq('horse_number', h_num).order('fetched_at', desc=True).limit(1).execute()
                # if response.data: previous_odds = response.data[0]['odds']
                
                if previous_odds:
                    drop_rate = (previous_odds - current_odds) / previous_odds
                    
                    if drop_rate >= 0.2:
                        print(f"ALERT: {h_name} dropped {drop_rate*100:.1f}% ({previous_odds} -> {current_odds})")
                        
                        # Save to Analysis
                        # supabase.table('odds_analysis').insert({...})
                        
                        # Post to Twitter
                        if twitter:
                            msg = f"【急落検知】\n{r_title} {h_num}番 {h_name}\nオッズ: {previous_odds} -> {current_odds} (▼{drop_rate*100:.1f}%)\n#JRA #競馬 #OddsAesthetic"
                            try:
                                twitter.create_tweet(text=msg)
                            except Exception as te:
                                print(f"Tweet failed: {te}")

                # Insert new snapshot
                # supabase.table('odds_snapshots').insert({...})
                
            except Exception as e:
                # print(f"Error parsing row: {e}")
                pass
        
        time.sleep(1) # Be polite

if __name__ == "__main__":
    main()
