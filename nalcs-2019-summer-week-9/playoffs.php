<html>
<head>
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
    <!-- <script src="https://d3js.org/d3.v5.min.js"></script> -->
</head>
<style>
    .container{
        padding-left: 01vw;
        padding-right: 01vw;
        padding-top: 05vh;
    }
    th, td {
        border: solid;
        border-width: 2px;
        padding: 0.5em;
    }
    td.vs, td.blue_side {
        border-right: none;
    }
    td.vs, td.red_side {
        border-left: none;
    }
    input {
        visibility:hidden;
    }
    label {
        margin-right: 0.5em;
        padding: 0.5em;
        cursor: pointer;
    }
    input:checked + label {
        background: yellow;
    }
    table {
        margin-top: 1vh;
    }
</style>
<body>
    <div class="container">
        <div class="row justify-content-center">
            <div class="col-xs-12 col-sm-12" style='margin: 0 0 2em 0;'>
                <div class="row justify-content-center">
                    <h2 class="col-12" style='text-align: center;'>NA LCS Summer Split Week 9</h2>
                    <h5 class="col-12" style='text-align: center;'>Click on team names to pick your winners from each game and click GO</h5>
                </div>
            </div>
            <div class="col-xs-12 col-sm-4">
                <div class="row justify-content-center">
                    <h2 class="col-12" style='text-align: center;'>Games</h2>
                </div>
                <div class="row justify-content-center" id="demo"></div>
            </div>
            <div class="col-xs-12 col-sm-4">
                <div class="row justify-content-center">
                    <h2 class="col-12" style='text-align: center;'>Standings</h2>
                </div>
                <div class="row justify-content-center" id="record"></div>
                <div class="row justify-content-center">
                    <p class="col-8" style='text-align: center; margin-top: 2em;'>
                        *Yellow indicate teams in contention for playoffs given the game results. If there are more than 6 teams then tiebreakers will be needed.
                    </p>
                </div>
            </div>
        </div>
    </div>

    <script>
    var wins = {
        "100": 7,
        "TL": 12,
        "CLG": 11,
        "C9": 10,
        "TSM": 9,
        "GGS": 8,
        "OPT": 8,
        "CG": 7,
        "FLY": 5,
        "FOX": 3
    };
    var losses = {
        "TL": 4,
        "CLG": 5,
        "C9": 6,
        "TSM": 7,
        "GGS": 8,
        "OPT": 8,
        "100": 9,
        "CG": 9,
        "FLY": 11,
        "FOX": 13
    };
    var games = [
        ["CLG", "OPT", "08-03", "14:00"],
        ["C9", "GGS", "08-03", "15:00"],
        ["CG", "100", "08-03", "16:00"],
        ["FLY", "TSM", "08-03", "17:00"],
        ["TL", "FOX", "08-03", "18:00"],
        ["OPT", "C9", "08-04", "12:00"],
        ["100", "CLG", "08-04", "13:00"],
        ["TSM", "TL", "08-04", "14:00"],
        ["GGS", "CG", "08-04", "15:00"],
        ["FOX", "FLY", "08-04", "16:00"]
    ];
    var teams = ["TL", "CLG", "C9", "TSM", "GGS", "OPT", "100", "CG", "FLY", "FOX"];

    updateRecord();

    var str = "<form><table><tbody>";
    str += "<tr></tr>";
    for (var i = 0; i < games.length; i++) {
        var game = games[i];
        str += "<tr>";
        if (i % 5 == 0) {
            str += "<td rowspan='5'>" + game[2] + "</td>";
        }
        str += "<td>" + game[3] + "</td>";
        str += "<td class='blue_side'><input type=\"radio\" id=\"" + i + "-1\" name=\"game" + i + "\" value=\"" + game[0] + "\" checked><label for=\"" + i + "-1\">" + game[0] + "</label></td>"
        str += "<td class='vs'>vs.</td>";
        str += "<td class='red_side'><input type=\"radio\" id=\"" + i + "-2\" name=\"game" + i + "\" value=\"" + game[1] + "\"><label for=\"" + i + "-2\">" + game[1] + "</label></td>"
        str += "</tr>";
    }
    str += "<tr><td colspan='2' align='center' style='border: none;'><button type=\"button\" onclick=\"checkForm()\">GO</button></td>";
    str += "<td colspan='2' align='center' style='border: none;'><button type=\"button\" onclick=\"resetRecord()\">Reset</button></td></tr>";
    str += "</tbody></table></form>";
    document.getElementById("demo").insertAdjacentHTML('beforeend', str);

    function checkForm() {
        var new_wins = {
            "TL": 12,
            "CLG": 11,
            "C9": 10,
            "TSM": 9,
            "GGS": 8,
            "OPT": 8,
            "100": 7,
            "CG": 7,
            "FLY": 5,
            "FOX": 3
        };
        var new_losses = {
            "TL": 4,
            "CLG": 5,
            "C9": 6,
            "TSM": 7,
            "GGS": 8,
            "OPT": 8,
            "100": 9,
            "CG": 9,
            "FLY": 11,
            "FOX": 13
        };

        for(var i = 0; i < 10; i++) {
            var game = document.getElementsByName('game' + i);
            var blue = game[0];
            var red = game[1];
            if (blue.checked) {
                new_wins[blue.value] ++;
                new_losses[red.value] ++;
            } else if (red.checked){
                new_wins[red.value] ++;
                new_losses[blue.value] ++;
            }
        }
        updateNewRecord(new_wins, new_losses);
    }

    function resetRecord() {
        for(var i = 0; i < 10; i++) {
            var game = document.getElementsByName('game' + i);
            game[0].checked = true;
        }
        updateRecord();
    }

    function updateRecord() {
        updateNewRecord(wins, losses);
    }

    function updateNewRecord(wins, losses) {
        // Create items array
        var items = Object.keys(wins).map(function(key) {
          return [key, wins[key]];
        });
        // Sort the array based on the second element
        items.sort(function(first, second) {
          return second[1] - first[1];
        });

        var rank = 0;
        var dup = 0;
        var curr_win = -1;
        str = "<table><tbody>";
        for (var i = 0; i < items.length; i++) {
            var curr_team = items[i][0];
            if (wins[curr_team] == curr_win) {
                dup++;
            } else {
                rank += dup + 1;
                dup = 0;
            }

            str += "<tr>";
            str += "<td name='rank'>" + rank + "</td>";
            str += "<td>" + curr_team + "</td>";
            str += "<td>" + wins[curr_team] + "</td>";
            str += "<td>" + losses[curr_team] + "</td>";
            str += "</tr>";

            curr_win = wins[curr_team];
        }
        str += "</tbody></table>";
        document.getElementById("record").innerHTML = str;

        var ranks = document.getElementsByName('rank');
        console.log(ranks);
        for (var i = 0; i < ranks.length; i++) {
            if (parseInt(ranks[i].innerHTML, 10) <= 6){
                ranks[i].style.backgroundColor = 'yellow';
            }
            else if (parseInt(ranks[i].innerHTML, 10) > 6){
                ranks[i].style.backgroundColor = 'none';
            }
        }
    }

    </script>


</body>
</html>
