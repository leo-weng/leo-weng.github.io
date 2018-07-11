# import libraries
import urllib2
from bs4 import BeautifulSoup
import csv
import os
import time
import io
import sys
reload(sys)
sys.setdefaultencoding('utf-8')

print "scraping start..."
# specify the url
round_1_page = 'http://www.volleyball.world/en/vnl/men/resultsandranking/round1'
match_page = 'http://www.volleyball.world'

#query the website and return the html
page = urllib2.urlopen(round_1_page)

# parse the html using beautifulsoup
soup = BeautifulSoup(page, 'html.parser')

print "teams..."
teams = []
for i in range(0, 16):
    # scrape team data
    id = 'wcbody_0_wcgridpad781180e1c6f34a88b89e0ca072c046b8_1_wcmenucontent_0_PoolsBox_Pools_PoolsBox_0_ctl00_0_Ranks_0_Link2_' + str(i)
    country_tag = soup.find('a', attrs={'id':id})
    rank_tag =  country_tag.parent.parent.parent.previous_sibling.previous_sibling
    games_tag = rank_tag.next_sibling.next_sibling.next_sibling.next_sibling
    wins_tag = games_tag.next_sibling.next_sibling
    losses_tag = wins_tag.next_sibling.next_sibling
    tup = (country_tag.text.strip(), rank_tag.text.strip(), wins_tag.text.strip(), losses_tag.text.strip())
    teams.append(tup)

# write team data to file
os.remove('team_data.csv')
with open('team_data.csv', 'a') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(['country', 'rank', 'wins', 'losses'])
    for row in teams:
        writer.writerow(row)


print "matches..."
matches = []
for i in range(0, 120):
    print i

    # prevent timeout error
    if (i % 20 == 19):
        print "sleep..."
        time.sleep(3)

    # scrape match data
    id = 'wcbody_0_wcgridpad781180e1c6f34a88b89e0ca072c046b8_1_wcmenucontent_0_PoolsBox_Pools_PoolsBox_0_ctl01_0_Results_0_MatchRow_' + str(i)
    tag = soup.find('tr', attrs={'id':id})
    date = tag.find_next('td', 'table-td-light')
    country_tag1 = tag.find_next('span', 'score')
    country_tag2 = country_tag1.find_next('span', 'score')
    score_tag1 = country_tag2.find_next('span', 'score')
    score_tag2 = score_tag1.find_next('span', 'score')
    print country_tag1.text, country_tag2.text

    # scrape post-match player data
    link = tag['data-href']
    temp = match_page + link[:-4] + 'match'
    curr_match_page = urllib2.urlopen(match_page + link[:-4] + 'post')
    match_soup = BeautifulSoup(curr_match_page, 'html.parser')
    player_id1 = 'wcbody_0_wcgridpad77e7924bbd7d431681716ed67a669ad0_1_wcmenucontent_2_BestScorers_TeamAPlayerName_0'
    player_id2 = 'wcbody_0_wcgridpad77e7924bbd7d431681716ed67a669ad0_1_wcmenucontent_2_BestScorers_TeamBPlayerName_0'
    player_tag1 = match_soup.find('a', attrs={'id':player_id1})
    player_tag2 = match_soup.find('a', attrs={'id':player_id2})
    kills_tag1 = player_tag1.find_next('span', 'value')
    kills_tag2 = player_tag2.find_next('span', 'value')
    match_soup.decompose()
    curr_match_page.close()

    del tag
    del curr_match_page
    del match_soup

    # add to tuple
    tup = ()
    if (score_tag1.text > score_tag2.text):
        # tup = (date.text.strip(), country_tag1.text.strip(), country_tag2.text.strip(), score_tag1.text.strip(), score_tag2.text.strip())
        # print date.text.strip()
        # print country_tag1.text.strip()
        # print country_tag2.text.strip()
        # print score_tag1.text.strip()
        # print score_tag2.text.strip()
        # print player_tag1.text.strip()
        # print player_tag2.text.strip()
        tup = (date.text.strip(), country_tag1.text.strip(), country_tag2.text.strip(), score_tag1.text.strip(), score_tag2.text.strip(), player_tag1.text.strip(), kills_tag1.text.strip(), player_tag2.text.strip(), kills_tag2.text.strip())
        # print(country_tag1.text, country_tag2.text)
    elif (score_tag1.text < score_tag2.text):
        # tup = (date.text.strip(), country_tag2.text.strip(), country_tag1.text.strip(), score_tag2.text.strip(), score_tag1.text.strip())

        tup = (date.text.strip(), country_tag2.text.strip(), country_tag1.text.strip(), score_tag2.text.strip(), score_tag1.text.strip(), player_tag2.text.strip(), kills_tag2.text.strip(), player_tag1.text.strip(), kills_tag1.text.strip())
        # print(country_tag1.text, country_tag2.text)
    matches.append(tup)
    del date
    del country_tag1
    del country_tag2
    del score_tag1
    del score_tag2
    del player_tag1
    del player_tag2

# write match data to file
os.remove('match_data.csv')
with open('match_data.csv', 'wb') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(['date', 'win_country', 'loss_country', 'win_score', 'loss_score', 'win_player', 'win_kills', 'loss_player', 'loss_kills'])
    for row in matches:
        writer.writerow(row)
