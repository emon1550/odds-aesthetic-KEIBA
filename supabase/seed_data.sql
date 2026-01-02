-- Insert a sample race
with new_race as (
  insert into races (race_date, location, race_number, race_name, start_time, status)
  values (current_date, '中山', 11, 'テスト記念(G1)', now() + interval '1 hour', 'scheduled')
  returning id
)
-- Insert a sample analysis alert
insert into odds_analysis (race_id, horse_number, horse_name, previous_odds, current_odds, drop_rate)
select 
  id, 
  7, 
  'ディープインパクト', 
  5.4, 
  3.2, 
  0.407
from new_race;

-- Insert another sample
with new_race_2 as (
  insert into races (race_date, location, race_number, race_name, start_time, status)
  values (current_date, '阪神', 10, 'MVPステークス', now() + interval '2 hours', 'scheduled')
  returning id
)
insert into odds_analysis (race_id, horse_number, horse_name, previous_odds, current_odds, drop_rate)
select 
  id, 
  3, 
  'サイレンススズカ', 
  12.8, 
  8.9, 
  0.304
from new_race_2;
