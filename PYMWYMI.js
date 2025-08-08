const response = {
    results: null,
    allRuns: null,
    topPicks: null,
    raceInfo: null
};

let rawHtml = null;

function receiveHtml(jsonEscapedHtml) {
    // jsonEscapedHtml is a JSON-style escaped string (with \uXXXX etc)
    
    // Wrap it in double quotes and parse it as JSON to decode
    const decodedHtml = JSON.parse(`"${jsonEscapedHtml}"`);

    console.log("Decoded HTML:", decodedHtml);

    // Now you can use decodedHtml as normal HTML string
    rawHtml = decodedHtml;

    getData();
}

let isTab = false;
const tabRowSelector = ".pseudo-body .row:not(.form)";
const pbRowSelector = ".f1e89rsm";
const tabFormClass = "form";
const pbFormClass = "flqb0s6";
const tabRunnerNameSelector = ".runner-name";
const pbRunnerNameSelector = ".f1zqw56";
let elSelector = "";

function execute(html) {
    rawHtml = html;
    getData();
}

function getData() {
    if (!rawHtml) {
        console.warn("No HTML passed in.");
        return;
    }

    clearTable('top-picks-table');
    clearTable('results-table');
    clearTable('top-runs-table');
    clearTable('run-history-table');

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    console.log(rawHtml);
    //reset
    response.results = null;
    response.allRuns = null;
    response.topPicks = null;
    response.raceInfo = null;

    const raceInfo = { distance: 0, distanceClass: "", noInfoCount: 0, noInfoClass: "", runnerCountClass: "", highUpset: { reasons: null }, condition: "", conditionClass: "" };
    const url = window.location.href;

    // Step 1: Remove the b ase URL
    const baseUrl = "https://www.tab.com.au/racing/";
    let trimmed = url.replace(baseUrl, "");

    let toggleEl = doc.querySelectorAll(tabRowSelector);

    if (toggleEl.length > 0) {
        isTab = true;
    }
    else {//Maybe the source is pb
        toggleEl = doc.querySelectorAll(pbRowSelector);

        if (toggleEl.length == 0) {
            alert("No data found");
        }
    }

    let meters = 0;

    // ✅ Safe access to distance element
    let dist = null;

    if (isTab) {
        dist = doc.querySelector('[data-test-race-distance]')?.textContent.trim().replace('m', '');
    }
    else {
        const container = doc.querySelector('.f16cvruj');

        if (container) {
            const cloned = container.cloneNode(true);//deep clone

            cloned.querySelectorAll('button').forEach(btn => btn.remove());
            dist = cloned.textContent.trim().replace('m', '');
        }
    }

    if (!dist) {
      console.warn('Distance element not found');
      //sendResponse({ error: 'Distance element not found' });
      return;
    }
    
    const conditionEl = isTab
        ? doc.querySelector('.meeting-info-track-condition')
        : doc.querySelector('.fu8zh8o')?.querySelector('.f1e2i7va');

    if (!conditionEl) {
      console.warn('Condition element not found');
      //sendResponse({ error: 'Condition element not found' });
      //return;
    }
    
    const conditionStr = conditionEl?.textContent || conditionEl?.innerText || "";
    
    let condition = conditionStr?.replace(/[^a-zA-Z]/g, '').toLowerCase();

    condition = condition == "hvy" ? "heavy" : condition;

    // ✅ Parse distance safely
    const match = dist.match(/\d+/);
    meters = parseInt(match?.[0] || "0");

    const rowEls = Array.from(toggleEl);
    const runners = [];

    raceInfo.distance = meters;

    if (meters < 800 || meters > 2000) {
        raceInfo.distanceClass = "poor";
    }

    for (const rowEl of rowEls) {
        let runs = [];

        if (!rowEl.querySelector(tabRunnerNameSelector) && !rowEl.querySelector(pbRunnerNameSelector)) continue;

        const formRow = isTab
            ? rowEl.nextElementSibling
            : rowEl.querySelector("." + pbFormClass);

        if (!formRow?.classList.contains(tabFormClass) && !formRow?.classList.contains(pbFormClass)) continue;

        const runnerNameEl = isTab
            ? rowEl.querySelector(tabRunnerNameSelector)
            : rowEl.querySelector(pbRunnerNameSelector);
        const runner = getRunner(runnerNameEl, rowEl, meters, condition);

        if (runner?.runs?.length <= 0) {
            raceInfo.noInfoCount += 1;

            if (raceInfo.noInfoCount >= 1 && raceInfo.noInfoCount <= 2) {
                raceInfo.noInfoClass = "fair";
            }
            else if (raceInfo.noInfoCount > 2) {
                raceInfo.noInfoClass = "poor";
            }
        }

        runners.push(runner);
    }

    if (runners.length == 7) {
        raceInfo.runnerCountClass = "fair";
    }
    else if (runners.length < 7) {
        raceInfo.runnerCountClass = "poor";
    }

    raceInfo.condition = condition;

    if (condition == "heavy" || condition == "hvy") {
        raceInfo.conditionClass = "poor";
    }
    else if (condition == "soft") {
        raceInfo.conditionClass = "fair";
    }

    const allRuns = runners.reduce((acc, runner) => {
        const relevantRuns = runner.runs.filter(run => run.isRelevantDistance);
        return acc.concat(relevantRuns);
    }, []);

    allRuns.sort((a, b) => {
        const aTime = a?.adjTimeDistAndCondOnly ?? Infinity;
        const bTime = b?.adjTimeDistAndCondOnly ?? Infinity;
        return aTime - bTime;
    });

    //If the race is a sprint, we want to recalculate the avg time score to use quickest time instead
    //This is because, quickest time is more important than average time
    if (meters <= 1200 || isDistanceCloseEnough(meters, 1200)) {
        recalculateTimeScore(runners, allRuns, meters);
    }

    rankRunnersByAttributes(runners);

    // Sort by overall score descending before sending
    runners.sort((a, b) => (b.overAll?.score || 0) - (a.overAll?.score || 0));

    response.raceInfo = raceInfo;
    response.topPicks = buildTopPicks(runners, meters, condition, allRuns);
    response.results = runners;
    response.allRuns = allRuns;

    renderAnalysis();
}

function renderAnalysis() {
    setupTableSorting();
    setupDialogClose();

    const raceInfo = response.raceInfo;
    const distDiv = document.querySelector("#distance");
    const dialogDistDiv = document.querySelector("#dialog-distance");
    const distText = "Dist: " + raceInfo.distance;
    const conditionDiv = document.querySelector("#condition");
    const dialogConditionDiv = document.querySelector("#dialog-condition");
    const conditionText = "Condition: " + raceInfo.condition;
    const noInfoDiv = document.querySelector("#noInfo");
    const runnerCountDiv = document.querySelector("#runnerCount");

    distDiv.textContent = distText;
    dialogDistDiv.textContent = distText;
    conditionDiv.textContent = conditionText;
    dialogConditionDiv.textContent = conditionText;
    noInfoDiv.textContent = "No Info: " + raceInfo.noInfoCount;
    runnerCountDiv.textContent = "Runners: " + response?.results?.length;
    distDiv.className = raceInfo.distanceClass;
    conditionDiv.className = raceInfo.conditionClass;
    noInfoDiv.className = raceInfo.noInfoClass;
    runnerCountDiv.className = raceInfo.runnerCountClass;

    if (raceInfo.noInfoCount > 1 && raceInfo.noInfoCount) {

    }

    const ptbody = document.querySelector("#results-table tbody");
    ptbody.innerHTML = "";

    if (!response?.results?.length) {
    console.warn("No results received");
    return;
    }

    const results = response.results;
    
    setupComponentCheckboxes(results);
    populateTopRuns(response.allRuns);
    populateTopPicks(response.topPicks);
    renderTableRows(results);
    addRunnerOnClick(results);
    matchTableWidths();
}

function getRunner(runnerNameEl, rowEl, meters, condition) {
  let number = null;
  let name = null;
  let weight = null;
  let fixedWin = null;
  let fixedPlace = null;
  let toteWin = null;
  let totePlace = null;
  let winPercentage = null;
  let placePercentage = null;
  let career = null;
  let formRow = null;

    if (isTab) {
        formRow = rowEl.nextElementSibling;

        const ancestor = runnerNameEl.closest('.cell.name-cell');
        const previousDiv = ancestor.previousElementSibling;
        const currWeightDiv = ancestor.parentElement.querySelector('.runner-weight-cell');
        const fixedWinDiv = ancestor.parentElement.querySelector('[data-id="fixed-odds-price"]');
        const fixedPlaceDiv = ancestor.parentElement.querySelector('[data-id="fixed-odds-place-price"]');
        const toteWinDiv = ancestor.parentElement.querySelector('[data-test-parimutuel-win-price]');
        const totePlaceDiv = ancestor.parentElement.querySelector('[data-test-parimutuel-place-price]');
        const winPercentageDiv = formRow?.querySelector('[percentage="runnerForm.winPercentage"]');
        const placePercentageDiv = formRow?.querySelector('[percentage="runnerForm.placePercentage"]');
        const careerDiv = formRow?.querySelectorAll('.form-details-list li')[0]?.querySelectorAll('span')[1];

        number = previousDiv ? previousDiv.textContent.trim() : null;
        name = runnerNameEl.textContent.trim();
        weight = currWeightDiv ? parseFloat(currWeightDiv.textContent.trim()) : null;
        fixedWin = fixedWinDiv ? parseFloat(fixedWinDiv.textContent.trim()) : null;
        fixedPlace = fixedPlaceDiv ? parseFloat(fixedPlaceDiv.textContent.trim()) : null;
        toteWin = toteWinDiv ? parseFloat(toteWinDiv.textContent.trim()) : null;
        totePlace = totePlaceDiv ? parseFloat(totePlaceDiv.textContent.trim()) : null;
        winPercentage = winPercentageDiv ? winPercentageDiv.textContent.trim() : null;
        placePercentage = placePercentageDiv ? placePercentageDiv.textContent.trim() : null;
        career = careerDiv ? careerDiv.textContent.trim() : null;
    }
    else {
        formRow = rowEl.querySelector("." + pbFormClass);

        const nameArray = runnerNameEl.textContent.split(".");
        const fixedWinSpan = rowEl.querySelector("[data-test*='WinOddsButton']").querySelector(".fheif50");
        const fixedPlaceSpan = rowEl.querySelector("[data-test*='PlaceOddsButton']").querySelector(".fheif50");
        const careerDiv = rowEl.querySelector(".f9k3qya");

        number = nameArray[0];
        name = nameArray[1].trim();
        fixedWin = fixedWinSpan && !isNaN(fixedWinSpan.textContent.trim()) ? parseFloat(fixedWinSpan.textContent.trim()) : null;
        fixedPlace = fixedPlaceSpan && !isNaN(fixedPlaceSpan.textContent.trim()) ? parseFloat(fixedPlaceSpan.textContent.trim()) : null;
        career = careerDiv ? careerDiv.textContent.trim() : null;
    }

    const odds = {
        fixed: {
            win: fixedWin?.toFixed(2),
            place: fixedPlace?.toFixed(2),
            display: fixedWin ? fixedWin + " / " + fixedPlace : ""
        },
        tote: {
            win: toteWin?.toFixed(2),
            place: totePlace?.toFixed(2),
            display: toteWin ? toteWin + " / " + totePlace: ""
        }
    };
    const repeatContainers = isTab
        ? formRow.querySelectorAll('[ng-repeat^="previousStart"]')
        : formRow.querySelectorAll('.f1gc7wf:not(.fcekpqf)');

  const runner = {
    number,
    name,
    weight,
    odds,
    success: {
      win: winPercentage,
      place: placePercentage
    },
    career,
    runs: []
  };

  let bestTime = null;
  let bestDate = null;
  let bestDistance = null;
  let bestCondition = null;
  let bestMargin = null;
  let bestPlace = null;



  const previousRuns = document.getElementById("previousRuns").value;
  let runLimitCount = 0;

  for (let i = 0; i < repeatContainers.length; i++) {
    const container = repeatContainers[i];
  
    if (previousRuns) {
      const previousRunsLimit = parseInt(previousRuns, 10);

      if (runLimitCount >= previousRunsLimit) {
          break;
      }
    }

    runLimitCount++;

    if (isTab && container.classList.contains('runner-spell')) continue;

    //Return if less than 12 children -- doesn't have the data we need
    const children = Array.from(container.children).filter(el => el.tagName === 'DIV');
    if ((isTab && children.length < 12) || (!isTab && children.length < 6)) return;

    const distEl = isTab
        ? children[4]
        : children[3];
    const dateEl = isTab
        ? children[2]
        : children[1];
    const distMatch = distEl?.textContent?.match(/\d+/);
    const date = dateEl?.textContent;

    let raceDate = null;

    const now = new Date();

    if (date) {
      raceDate = parseDateDMY(date.trim());

      if (isNaN(raceDate)) {
        console.warn("Invalid race date format:", date);
        return; // skip this entry
      }
    }

    const pbRunInfo = container.parentNode.parentNode.querySelectorAll(".f1pa5q2s")
    const currConditionEl = isTab
        ? children[3]
        : children[4];
    const currWeightEl = isTab
        ? children[7]
        : null;
    const currCondition = currConditionEl?.textContent?.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const weightMatch = currWeightEl?.textContent?.match(/\d+/);
    const currWeight = weightMatch ? parseInt(weightMatch[0], 10) : null;
    const marginEl = isTab
        ? children[10]
        : pbRunInfo[5]?.querySelector(".f1dbu90w");
    const currDistance = parseInt(distMatch?.[0] || "0");
    const margin = parseFloat(marginEl?.textContent);
    const place = children[0]?.textContent;
    const sectionalPositionEl = isTab
        ? children[12]
        : pbRunInfo[7]?.querySelector(".f1dbu90w");
    const sectionalPosition = sectionalPositionEl?.textContent;
    const timeEl = isTab
        ? children[11]
        : pbRunInfo[6]?.querySelector(".f1dbu90w");
    const [min, sec] = timeEl?.textContent?.split(':').map(Number);
    let currTime = null;

    if (!isNaN(min) && !isNaN(sec)) {
      currTime = (min * 60) + sec;
    }

    const adjTimeDistOnly = adjustTimeByDistance(currTime, currDistance, meters);
    const adjTimeDistAndCondOnly = adjTimeDistOnly != null ? adjustTimeForCondition(adjTimeDistOnly, currCondition, condition, meters) : null;
    const adjTimeWithWeight = (adjTimeDistAndCondOnly && isTab) ? adjustTimeForWeightDifference(adjTimeDistAndCondOnly, currWeight, weight, meters, condition) : adjTimeDistAndCondOnly;

    const run = {
      number,
      name,
      odds,
      date,
      parsedDate: raceDate,
      weightToday: weight,
      condition: currCondition == "hvy" ? "heavy" : currCondition,
      weight: currWeight,
      distance: currDistance,
      margin,
      place,
      sectionalPosition,
      time: currTime,
      adjTimeDistOnly,
      adjTimeDistAndCondOnly,
      adjTimeWithWeight,
      distMps: meters / adjTimeDistOnly,
      distAndCondMps: meters / adjTimeDistAndCondOnly,
      distCondAndWeightMps: meters / adjTimeWithWeight,
      isRelevantDistance: isDistanceCloseEnough(currDistance, meters)
    }

    parsePlacing(run);
    run.finishingSpeed = estimateFinishingSpeed(meters, run);
    run.marginValue = getSignedMargin(run);
    run.competitiveScore = calculateCompetitiveScore(run);
    run.classPerformance = classifyTimePerformance(run);

    if (isTab) {
      if (run.weightToday <= run.weight) {
          run.weightClass = "good";
      }
      else {
        const weightDiff = run.weightToday - run.weight;

        if (weightDiff < 3) {
          run.weightClass = "fair";
        }
        else {
          run.weightClass = "poor";
        }
      }
    }

    if (adjTimeDistAndCondOnly != null) {
      if (bestTime === null || adjTimeDistAndCondOnly < bestTime) {
        bestTime = adjTimeDistAndCondOnly;
        bestDate = date;
        bestDistance = currDistance;
        bestCondition = currCondition;
        bestMargin = run.marginValue;
        bestPlace = place;
      }
    }

    const runStyle = calculateStyleScore(run);

    run.style = runStyle.style;
    run.styleScore = runStyle.score;

    runner.runs.push(run);
  };

  runner.best = {
    date: bestDate,
    time: bestTime,
    distance: bestDistance,
    condition: bestCondition,
    marginValue: bestMargin,
    place: bestPlace
  };

  adjustForWeightSensitivity(runner);//Ensure weight adjustment is correct based on horse's ability to carry a different weight

  runner.scoreWeights = getDynamicWeights(meters, condition);
  runner.timeStableScore = getTimeStabilityScore(runner.runs, true);
  runner.distanceSuitability = assessDistanceSuitability(runner, meters);
  runner.conditionSuitability = assessConditionSuitability(runner, condition);
  runner.burstPotential = assessBurstPotential(runner, condition);
  runner.styleSuitability = assessStyleSuitability(runner, meters, condition);
  runner.averageTimeOnDistance = calculateAvgTimeScore(runner, meters);
  runner.currentForm = assessCurrentForm(runner);
  runner.overAll = calculateOverallScore(runner);
  runner.avgSpeed = calculateAverageSpeedAdjustedForCondition(runner, condition);
  runner.returnToComfort = assessRevivalFromOldDistanceMatch(runner, meters, condition);
  runner.returnFromBreak = assessReturnFromBreak(runner, meters);

  const leftColor = suitabilityColors[runner.distanceSuitability.weighting];
  const rightColor = suitabilityColors[runner.conditionSuitability.weighting];

  runner.suitabilityStyle = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  const runCount = runner.runs?.length || 0;

  if (runCount <= 1) {
      runner.suitabilityStyle += `; border: 2px solid ${suitabilityColors['poor']}`;
  } else if (runCount <= 4) {
      runner.suitabilityStyle += `; border: 2px solid ${suitabilityColors['fair']}`;
  }

  return runner;
}

//Code Helpers-----------------------------------------------------------------------------------------------------------------------------------
function parseDateDMY(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  let [dd, mm, yyyy] = parts.map(Number);

  if (yyyy.toString().length <= 2) yyyy += 2000;

  return new Date(yyyy, mm - 1, dd); // months are 0-based in JS Date

}

function isWithinLast97Days(runDate) {
    if (!runDate || isNaN(runDate)) return false;
    const now = new Date();
    const diffDays = (now - runDate) / (1000 * 60 * 60 * 24);
    return diffDays <= 97;
}

function normalizeCondition(cond) {
  return cond?.toLowerCase().trim();
}

function isSimilarCondition(a, b) {
  const normA = normalizeCondition(a);
  const normB = normalizeCondition(b);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const similarPairs = [
    ["soft", "heavy"],
    ["soft", "hvy"],
    ["soft", "sloppy"],     // new
    ["heavy", "sloppy"],    // new
    ["muddy", "soft"],      // new
    ["muddy", "heavy"],     // new
    ["muddy", "sloppy"],    // new
    ["good", "firm"],
    ["slow", "soft"],
    ["awt", "good"],
    ["awt", "firm"],
    ["awt", "soft"],
    ["fast", "firm"],
    ["fast", "good"],
    ["fast", "awt"]
  ];

  return similarPairs.some(([x, y]) =>
    (normA === x && normB === y) || (normA === y && normB === x)
  );
}

function getWeightedSuitabilityLabel(score, weight) {
  const maxScore = 100 * weight;

  const thresholds = {
    bad: maxScore * 0.15,
    poor: maxScore * 0.30,
    fair: maxScore * 0.50,
    good: maxScore * 0.80,
    great: maxScore * 1.00
  };

  if (score < thresholds.bad) return 'bad';
  if (score < thresholds.poor) return 'poor';
  if (score < thresholds.fair) return 'fair';
  if (score < thresholds.good) return 'good';
  return 'great';
}
// Categorize raw distance (meters) into short/mid/long
function categorizeDistance(meters) {
  if (meters <= 1200 || isDistanceCloseEnough(meters, 1200)) return 'short';
  if (meters <= 1800 || isDistanceCloseEnough(meters, 1600)) return 'mid';
  return 'long';
}

// Normalize condition for matrix keys
function normalizeCondition(cond) {
    if (!cond) return 'good';
    const c = cond.toLowerCase();

    if (c.includes('firm')) return 'firm';
    if (c.includes('good')) return 'good';
    if (c.includes('awt') || c.includes('all weather')) return 'awt';
    if (c.includes('fast')) return 'fast';
    if (c.includes('soft')) return 'soft';
    if (c.includes('heavy') || c === 'hvy') return 'heavy';
    if (c.includes('slow')) return 'slow';
    if (c.includes('muddy')) return 'muddy';
    if (c.includes('sloppy')) return 'sloppy';

    return 'good'; // default fallback
}

function getDistanceTolerance(meters) {
  if (meters <= 1200) return 100;
  if (meters <= 1600) return 200;
  return null; // stayers
}

function isDistanceCloseEnough(runDistance, targetDistance) {
  const distanceTolerance = getDistanceTolerance(targetDistance);
  const diff = Math.abs(runDistance - targetDistance);

  // Strict tolerance, if distanceTolerance is null, it means long distances, any runs are accepted except anything more than 200m south
  if ((distanceTolerance == null && (targetDistance - runDistance <= 200)) || diff <= distanceTolerance) return true;

  // Also allow if difference is less than 10% of targetDistance (for scaled closeness)
  if (diff <= targetDistance * 0.1) return true;

  return false;
}

function getDynamicWeights(meters, condition) {
    const cond = normalizeCondition(condition);
    const isSprint = meters <= 1200;
    const isMid = meters > 1200 && meters <= 1600;
    const isLong = meters > 1600;

    // Updated base weights with formWeight removed and redistributed proportionally
    let weights = {
        distanceWeight: 0,
        conditionWeight: 0,
        burstWeight: 0,
        avgTimeWeight: 0
    };

    // Base weights with formWeight (previously 0.14, 0.18, 0.22) redistributed
    if (isSprint) {
        weights = {
            avgTimeWeight: 0.32,  // Most important in sprints
            distanceWeight: 0.28,  // Still quite important
            conditionWeight: 0.22,
            burstWeight: 0.18,  // Less important in sprints
            formWeight: 0      // Ignored in scoring
        };
    } else if (isMid) {
        weights = {
            distanceWeight: 0.265,
            conditionWeight: 0.245,
            burstWeight: 0.225,
            avgTimeWeight: 0.265,
            formWeight: 0
        };
    } else if (isLong) {
        weights = {
            distanceWeight: 0.265,
            conditionWeight: 0.275,
            burstWeight: 0.17,      // Slightly lower burst
            avgTimeWeight: 0.29,    // Slightly higher avgTime
            formWeight: 0
        };
    }

    // Updated condition deltas, with formWeight removed and rebalanced
    const conditionWeightDeltas = getConditionWeightDelta(condition, meters);
    const delta = conditionWeightDeltas[cond];
    if (delta) {
        for (const key in delta) {
            if (weights[key] !== undefined) {
                weights[key] += delta[key];
                weights[key] = Math.max(weights[key], 0); // clamp to 0
            }
        }

        // Final normalization to ensure all weights sum to 1
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const key in weights) {
            weights[key] /= total;
        }
    }

    return weights;
}

function getConditionWeightDelta(condition, meters) {
    const isSprint = meters <= 1200;

    switch (condition?.toLowerCase()) {
        case 'heavy':
        case 'hvy':
            return {
                conditionWeight: isSprint ? +0.06 : +0.12,
                avgTimeWeight: isSprint ? -0.06 : -0.12,
                burstWeight: -0.07,
                distanceWeight: +0.07
            };
        case 'muddy':
            return {
                conditionWeight: isSprint ? +0.05 : +0.10,
                avgTimeWeight: isSprint ? -0.05 : -0.10,
                burstWeight: -0.06,
                distanceWeight: +0.06
            };
        case 'sloppy':
            return {
                conditionWeight: isSprint ? +0.045 : +0.09,
                avgTimeWeight: isSprint ? -0.045 : -0.09,
                burstWeight: -0.05,
                distanceWeight: +0.05
            };
        case 'soft':
            return {
                conditionWeight: isSprint ? +0.035 : +0.07,
                avgTimeWeight: isSprint ? -0.035 : -0.07,
                burstWeight: -0.04,
                distanceWeight: +0.04
            };
        case 'slow':
            return {
                conditionWeight: isSprint ? +0.025 : +0.05,
                avgTimeWeight: isSprint ? -0.025 : -0.05,
                burstWeight: -0.02,
                distanceWeight: +0.02
            };
        case 'good':
            return {
                conditionWeight: -0.02,
                burstWeight: +0.03,
                avgTimeWeight: +0.01
            };
        case 'firm':
            return {
                conditionWeight: -0.03,
                burstWeight: +0.05,
                avgTimeWeight: +0.03
            };
        case 'fast':
            return {
                conditionWeight: -0.04,
                burstWeight: +0.06,
                avgTimeWeight: +0.03
            };
        case 'awt':
            return {
                conditionWeight: -0.07,
                avgTimeWeight: +0.03,
                distanceWeight: +0.04
            };
        default:
            return {}; // Fallback for unknown conditions
    }
}
//-----------------------------------------------------------------------------------------------------------------------------------------------

//Race Functions---------------------------------------------------------------------------------------------------------------------------------
function buildTopPicks(runners, meters, condition, allRuns) {
  const candidateScores = {};

  // Top 3 Overall Score (Triple Weight)
  buildTopOverall(runners, candidateScores);

  // Quickest times
  buildTopQuickestTimes(runners, allRuns, candidateScores);

  // Fatest Burst
  buildTopBurst(runners, candidateScores);

  // Top 3 in Form Score (Double Weight)
  buildTopFormScore(runners, candidateScores);

  // Top 5 in Condition Suitability
  buildTopCondition(runners, condition, candidateScores);

  // Top 5 in Style Suitability
  buildTopStyles(runners, candidateScores);

  // Top 3 in Average Time Suitability (Sprints only, Double Weight)
  buildTopAverageTimes(runners, meters, candidateScores);

  //Top 3 in Distance Suitability
  buildTopDistance(runners, candidateScores);

  // Apply featured scores and comments
  for (const r of runners) {
    const scored = candidateScores[r.number];
    if (scored) {
      r.featuredScore = scored.score;
      r.reasons = scored.reasons;
    }
  }

  // Pick top 4 based on featuredScore (may return >3 if ties)
  const withScores = runners.filter(r => r.featuredScore != null);
  const sortedByFeatured = [...withScores].sort((a, b) => b.featuredScore - a.featuredScore);

  const topScoreThreshold = sortedByFeatured[3]?.featuredScore ?? sortedByFeatured[0]?.featuredScore ?? 0;
  const topPicks = sortedByFeatured.filter(r => r.featuredScore >= topScoreThreshold);

  buildDownsides(topPicks, meters, condition, allRuns);

  return topPicks;
}

function buildTopOverall(runners, candidateScores) {
  for (let i = 0; i < 3 && i < runners.length; i++) {
    const runner = runners[i];
    const score = (3 - i) * 3; // 1st = 9, 2nd = 6, 3rd = 3

    candidateScores[runner.number] = {
      score,
      reasons: [`Top ${i + 1} in Overall Score`]
    };
  }
}

function buildTopQuickestTimes(runners, allRuns, candidateScores) {
  const now = new Date();
  const top10 = allRuns.slice(0, 10); // already sorted by adjTimeDistAndCondOnly
  const top5 = allRuns.slice(0, 5);

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 3);//3 day leeway

  const runnerScores = {}; // temp score tracking
  let top3LatesteCount = 0;

  // Count top 10 and top 5 appearances
  for (let i = 0; i < top10.length; i++) {
    const run = top10[i];
    const num = run.number;
    const runDate = parseDateDMY(run.date);
    if (!runnerScores[num]) {
      runnerScores[num] = {
        top5: 0,
        top10: 0,
        recentTop3Bonus: 0,
        recentTop3Reason: null
      };
    }

    if (i < 5) {
      runnerScores[num].top5++;
    }
    else {
      runnerScores[num].top10++;
    }

    // Check if this run is in recent top 3
    if (runDate >= threeMonthsAgo) {
      if (top3LatesteCount === 0) {
        runnerScores[num].recentTop3Bonus = 6;
        runnerScores[num].recentTop3Reason = "Has 1st quickest run within last 3 months";
      } else if (top3LatesteCount === 1) {
        runnerScores[num].recentTop3Bonus = 2;
        runnerScores[num].recentTop3Reason = "Has 2nd quickest run within last 3 months";
      } else if (top3LatesteCount === 2) {
        runnerScores[num].recentTop3Bonus = 1;
        runnerScores[num].recentTop3Reason = "Has 3rd quickest run within last 3 months";
      }

      top3LatesteCount++;
    }
  }

  // Apply final scoring
  for (const num in runnerScores) {
    const { top5, top10, recentTop3Bonus, recentTop3Reason } = runnerScores[num];
    const runner = runners.find(r => r.number === num);
    if (!runner) continue;

    const distCategory = classifyDistanceType(runner.runs?.[0]?.distance);
    let score = 0;
    let reasonParts = [];

    if (distCategory === 'sprint') {
      score += top5 * 3 + top10 * 2;
      score = Math.min(score, 6);
    } else if (distCategory === 'mid') {
      score += top5 * 2 + top10 * 1.5;
      score = Math.min(score, 4);
    } else if (distCategory === 'long') {
      score += top5 * 2 + top10 * 1;
      score = Math.min(score, 3);
    }

    // Add recent bonus
    score += recentTop3Bonus;

    // Build reasons
    if (top5 > 0) reasonParts.push(`${top5} in top 5`);
    if (top10 > 0) reasonParts.push(`${top10} in top 10`);
    const reason = `Has ${top5 + top10} run${top5 + top10 > 1 ? 's' : ''}: ${reasonParts.join(", ")} quickest times`;

    const reasons = [reason];
    if (recentTop3Reason) reasons.push(recentTop3Reason);

    if (candidateScores[num]) {
      candidateScores[num].score += score;
      candidateScores[num].reasons.push(...reasons);
    } else {
      candidateScores[num] = {
        score,
        reasons
      };
    }
  }

  function parseDateDMY(str) {
    const [d, m, y] = str.split("/").map(s => parseInt(s));
    return new Date(y, m - 1, d);
  }
}

function buildTopBurst(runners, candidateScores) {
  const sorted = [...runners]
    .filter(r => r.burstPotential && typeof r.burstPotential.score === 'number')
    .sort((a, b) => b.burstPotential.score - a.burstPotential.score)
    .slice(0, 3);

  sorted.forEach((runner, index) => {
    const baseScore = 3 - index; // 3, 2, 1
    const distType = classifyDistanceType(runner.runs?.[0]?.distance);
    const score = distType === 'mid' ? baseScore * 2 : baseScore;

    const reason = `Top ${index + 1} in burst suitability${distType === 'mid' ? " (mid-distance bonus)" : ""}`;
    const number = runner.number;

    if (candidateScores[number]) {
      candidateScores[number].score += score;
      candidateScores[number].reasons.push(reason);
    } else {
      candidateScores[number] = {
        score,
        reasons: [reason]
      };
    }
  });
}

function buildTopFormScore(runners, candidateScores) {
  const topForm = [...runners]
    .filter(r => r.currentForm?.score != null)
    .sort((a, b) => b.currentForm.score - a.currentForm.score)
    .slice(0, 3);

  for (let i = 0; i < topForm.length; i++) {
    const r = topForm[i];
    const basePoints = 3 - i;
    const points = basePoints * 2;

    if (!candidateScores[r.number]) {
      candidateScores[r.number] = { score: 0, reasons: [] };
    }

    candidateScores[r.number].score += points;
    candidateScores[r.number].reasons.push(`Top ${i + 1} in Current Form`);
  }
}

function buildTopCondition(runners, condition, candidateScores) {
  const normCond = normalizeCondition(condition);
  const softOrWorse = isSoftOrWorse(condition);

    if (softOrWorse) {
    const topCond = [...runners]
      .filter(r => r.conditionSuitability?.score != null)
      .sort((a, b) => b.conditionSuitability.score - a.conditionSuitability.score)
      .slice(0, 5);

    for (let i = 0; i < topCond.length; i++) {
      const r = topCond[i];
      const basePoints = 5 - i;
      const points = basePoints * 2;

      if (!candidateScores[r.number]) {
        candidateScores[r.number] = { score: 0, reasons: [] };
      }

      candidateScores[r.number].score += points;
      candidateScores[r.number].reasons.push(`Top ${i + 1} in Condition Suitability`);
    }
  }
}

function isSoftOrWorse(condition) {
    return ["soft", "slow", "heavy", "hvy", "muddy", "sloppy"].includes(normalizeCondition(condition));
}

function buildTopStyles(runners, candidateScores) {
  const topStyle = [...runners]
    .filter(r => r.styleSuitability?.score != null)
    .sort((a, b) => b.styleSuitability.score - a.styleSuitability.score)
    .slice(0, 5);

  for (let i = 0; i < topStyle.length; i++) {
    const r = topStyle[i];
    const basePoints = 5 - i;

    if (!candidateScores[r.number]) {
      candidateScores[r.number] = { score: 0, reasons: [] };
    }

    candidateScores[r.number].score += basePoints;
    candidateScores[r.number].reasons.push(`Top ${i + 1} in Style Suitability`);
  }
}

function buildTopAverageTimes(runners, meters, candidateScores) {
  if (meters <= 1200 || isDistanceCloseEnough(meters, 1200)) {
    const topAvgTime = [...runners]
      .filter(r => r.averageTimeOnDistance?.score != null)
      .sort((a, b) => b.averageTimeOnDistance.score - a.averageTimeOnDistance.score)
      .slice(0, 3);

    for (let i = 0; i < topAvgTime.length; i++) {
      const r = topAvgTime[i];
      const basePoints = (3 - i) * 2;

      if (!candidateScores[r.number]) {
        candidateScores[r.number] = { score: 0, reasons: [] };
      }

      candidateScores[r.number].score += basePoints;
      candidateScores[r.number].reasons.push(`Top ${i + 1} in Average Time Suitability`);
    }
  }
}

function buildTopDistance(runners, candidateScores) {
  const topDistance = [...runners]
    .filter(r => r.distanceSuitability?.score != null)
    .sort((a, b) => b.distanceSuitability.score - a.distanceSuitability.score)
    .slice(0, 3);

  for (let i = 0; i < topDistance.length; i++) {
    const r = topDistance[i];
    const basePoints = 3 - i; // 1st = 3, 2nd = 2, 3rd = 1

    if (!candidateScores[r.number]) {
      candidateScores[r.number] = { score: 0, reasons: [] };
    }

    candidateScores[r.number].score += basePoints;
    candidateScores[r.number].reasons.push(`Top ${i + 1} in Distance Suitability`);
  }
}

function buildDownsides(topPicks, meters, condition, allRuns) {
  const now = new Date();
  const normCond = normalizeCondition(condition);
  const softOrWorse = isSoftOrWorse(condition);
  const isSprint = meters <= 1200 || isDistanceCloseEnough(meters, 1200);
  const isMid = !isSprint && (meters <= 1800 || isDistanceCloseEnough(meters, 1800));

  for (const runner of topPicks) {
    runner.downsides = [];

    // 1️⃣ Recent layoff
    if (!runner.runs || runner.runs.length === 0) {
      runner.downsides.push("No race history");
    } else {
      const mostRecentRun = runner.runs[0];
      const runDate = mostRecentRun.parsedDate;
      const monthsSinceLastRun = (now.getFullYear() - runDate.getFullYear()) * 12 + (now.getMonth() - runDate.getMonth());

      if (monthsSinceLastRun > 3) {
        runner.downsides.push(`Layoff over 3 months: last run ${monthsSinceLastRun} months ago`);
      }

      // Only 1 run since break
      let runsSinceBreak = 0;
      for (let i = 0; i < runner.runs.length; i++) {
        const d1 = runner.runs[i].parsedDate;
        const d2 = runner.runs[i + 1] ? runner.runs[i + 1].parsedDate : null;
        const gap = d2 ? (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth()) : 0;

        runsSinceBreak++;
        if (gap > 3) runsSinceBreak = 1;
      }

      if (runsSinceBreak === 1) {
        runner.downsides.push("Only 1 run since recent break");
      }
    }

    //Very Old Quickest Times

    // 2️⃣ Suitability checks — flag bad or poor
    const flagIfBadOrPoor = (obj, label) => {
      if (!obj || !obj.label) return;
      const lowered = obj.label.toLowerCase();
      if (lowered.includes("poor") || lowered.includes("bad")) {
        runner.downsides.push(`Is ${lowered} in ${label}`);
      }
    };

    flagIfBadOrPoor(runner.distanceSuitability, "distance suitability");

    if (softOrWorse) {
      flagIfBadOrPoor(runner.conditionSuitability, `${normCond} conditions`);
    }

    if (isMid) {
      flagIfBadOrPoor(runner.burstPotential, "burst potential");
    }

    flagIfBadOrPoor(runner.styleSuitability, "style suitability");

    if (isSprint) {
      flagIfBadOrPoor(runner.averageTimeOnDistance, "average time");
    }
  }

  flagStaleTopRuns(topPicks, allRuns);

  if (!isMid) {//Mid races not so important
    flagNoTop10Runs(topPicks, allRuns);
  }
}

function flagStaleTopRuns(topPicks, allRuns) {
  const now = new Date();
  const top10 = [...allRuns]
    .sort((a, b) => a.adjTimeDistAndCondOnly - b.adjTimeDistAndCondOnly)
    .slice(0, 10);

  const top5 = top10.slice(0, 5);

  for (const runner of topPicks) {
    const runnerTopRuns = top10.filter(run => run.number === runner.number);
    if (runnerTopRuns.length === 0) continue;

    const months = dateString => {
      const d = new Date(dateString);
      return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    };

    const allOver12Months = runnerTopRuns.every(run => months(run.parsedDate) > 12);
    const allOver3Months = runnerTopRuns.every(run => months(run.parsedDate) > 3);
    const allOver2Months = runnerTopRuns.every(run => months(run.parsedDate) > 2);
    const newestRun = runnerTopRuns.reduce((a, b) =>
      a.parsedDate > b.parsedDate ? a : b
    );
    const newestRunAge = months(newestRun.parsedDate);
    const isInTop5 = top5.some(run => run.number === runner.number);

    // 1️⃣ Major concern — all top 10 runs are over a year old
    if (allOver12Months) {
      runner.downsides.push("⚠️ All top 10 adjusted runs are over 1 year old");
    } else if (allOver3Months) {
      runner.downsides.push("All top 10 adjusted runs are over 3 months old");
    } else if (allOver2Months) {
      runner.downsides.push("All top 10 adjusted runs are older than 2 months");
    }

    // 2️⃣ Strong time in top 5 but it’s stale
    if (isInTop5 && newestRunAge > 3) {
      runner.downsides.push("Top 5 adjusted time, but latest was over 3 months ago");
    }

    // 3️⃣ Has multiple top runs, but none are among recent races
    if (runnerTopRuns.length >= 2) {
      const last3Dates = runner.runs?.slice(0, 3).map(r => r.parsedDate) || [];
      const hasRecentTopRun = runnerTopRuns.some(run =>
        last3Dates.includes(run.parsedDate)
      );
      if (!hasRecentTopRun) {
        runner.downsides.push("Multiple top runs but none are from recent races");
      }
    }
  }
}

function flagNoTop10Runs(topPicks, allRuns) {
  const top10 = allRuns.slice(0, 10);

  for (const runner of topPicks) {
    const hasRunInTop10 = runner.runs?.some(run =>
      top10.some(tr => tr.number === runner.number && tr.parsedDate === run.parsedDate)
    );

    if (!hasRunInTop10) {
      runner.downsides = runner.downsides || [];
      runner.downsides.push("⚠️ No runs in the top 10 quickest times");
    }
  }
}
//Predictive such as potention upsets -----------------------------------------------------------------------------------------------------------
function assessRevivalFromOldDistanceMatch(runner, meters, targetCondition) {
  const DIST_TOLERANCE = 50;
  const MIN_COMPETITIVE_SCORE = 65; // Was 0.65 of 18
  const MIN_DAYS_OLD = 90;
  const MIN_RUNS_OLD = 5;
  const MAX_RECENT_SCORE = 50; // Was 0.5 of 18
  const MAX_COMPETITIVE_SCORE = 100;

  if (!runner.runs || runner.runs.length === 0) {
    return { score: 0, reason: "No runs" };
  }

  const today = new Date();
  const normalizeCond = normalizeCondition(targetCondition);

  function isGoodOldMatch(run) {
    if (run.competitiveScore == null) return false;
    const isGoodScore = run.competitiveScore >= MIN_COMPETITIVE_SCORE;
    const isCloseDistance = Math.abs(run.distance - meters) <= DIST_TOLERANCE;
    const isSameCondition = normalizeCondition(run.condition) === normalizeCond;
    return isGoodScore && isCloseDistance && isSameCondition;
  }

  let bestOldMatch = null;
  for (let i = runner.runs.length - 1; i >= 0; i--) {
    const run = runner.runs[i];
    if (run.competitiveScore == null) continue;

    const runDate = run.parsedDate ?? null;
    const daysAgo = runDate ? (today - runDate) / (1000 * 60 * 60 * 24) : null;

    const isOldEnough = (daysAgo !== null && daysAgo >= MIN_DAYS_OLD) || (runner.runs.length - 1 - i) >= MIN_RUNS_OLD;
    if (isGoodOldMatch(run) && isOldEnough) {
      bestOldMatch = { ...run, daysAgo, runsAgo: runner.runs.length - 1 - i };
      break;
    }
  }

  if (!bestOldMatch) {
    return { score: 0, reason: "No good old match" };
  }

  const recentRuns = runner.runs
    .slice(0, 4)
    .filter(r => r.competitiveScore != null);

  const poorRecent = recentRuns.filter(r => r.competitiveScore < MAX_RECENT_SCORE);
  const mismatchCount = recentRuns.filter(r => {
    const distMismatch = Math.abs(r.distance - meters) > 100;
    const condMismatch = normalizeCondition(r.condition) !== normalizeCond;
    return distMismatch || condMismatch;
  }).length;

  if (poorRecent.length < 2 || mismatchCount < 2) {
    return { score: 0, reason: "Recent form not weak enough or not mismatched enough" };
  }

  const baseNormalized = bestOldMatch.competitiveScore / MAX_COMPETITIVE_SCORE;
  const mismatchFactor = (mismatchCount + poorRecent.length) / 8;
  const rawScore = baseNormalized * mismatchFactor * 100;
  const score = Math.round(Math.min(rawScore, 100));

  return {
    score,
    reason: "Revival pattern matched",
    runs: [bestOldMatch],
    recentPoorRuns: poorRecent.length,
    recentMismatchCount: mismatchCount
  };
}

// Assesses a horse that had a long break and is showing signs of returning to form
function assessReturnFromBreak(runner, meters, targetCondition) {
  const weights = runner.scoreWeights;
  const MAX_COMPETITIVE_SCORE = 100;

  if (!runner.runs || runner.runs.length < 3) {
    return { score: 0, reason: "Insufficient data", runs: [] };
  }

  const now = new Date();

  // Step 1: Find a long break between two runs (> 90 days)
  let breakIndex = -1;
  for (let i = 1; i < runner.runs.length; i++) {
    const prev = runner.runs[i - 1].parsedDate;
    const curr = runner.runs[i].parsedDate;
    const daysBetween = (prev - curr) / (1000 * 60 * 60 * 24);
    if (daysBetween > 90) {
      breakIndex = i;
      break;
    }
  }

  if (breakIndex === -1 || breakIndex + 2 >= runner.runs.length) {
    return { score: 0, reason: "No long break with enough comeback runs", runs: [] };
  }

  // Filter comebackRuns to only those with valid competitiveScore
  const comebackRuns = runner.runs
    .slice(0, breakIndex)
    .filter(run => typeof run.competitiveScore === 'number');

  if (comebackRuns.length < 2) {
    return { score: 0, reason: "Not enough valid post-break form data", runs: comebackRuns };
  }

  const lastGoodRun = runner.runs[breakIndex];
  if (typeof lastGoodRun.competitiveScore !== 'number') {
    return { score: 0, reason: "Invalid pre-break run score", runs: comebackRuns };
  }

  // Use raw 0–100 scores for form trend
  const formScores = comebackRuns.map(run => Math.min(run.competitiveScore, 100));
  const improving = formScores[0] < formScores[formScores.length - 1];
  const improvementAmount = formScores[formScores.length - 1] - formScores[0];

  // Check if pre-break run was strong at relevant dist/cond
  const isRelevantDistance = isDistanceCloseEnough(lastGoodRun.distance, meters);
  const isSameCond = normalizeCondition(lastGoodRun.condition) === normalizeCondition(targetCondition);
  const strongBefore = lastGoodRun.competitiveScore >= 65;

  const validSignal = improving && improvementAmount >= 10 && isRelevantDistance && isSameCond && strongBefore;

  if (!validSignal) {
    return { score: 0, reason: "No strong signal of return to form", runs: comebackRuns };
  }

  // Score based on improvement and bonuses
  let baseScore = improvementAmount; // already 0–100 scale

  if (formScores[formScores.length - 1] > 75) baseScore += 10;
  if (formScores.length >= 3) baseScore += 5;

  baseScore = Math.min(baseScore, 100);

  return {
    score: Math.round(baseScore),
    runs: comebackRuns,
    reason: "Detected return to form after long break"
  };
}

//-----------------------------------------------------------------------------------------------------------------------------------------------

//Race Functions---------------------------------------------------------------------------------------------------------------------------------
function calculateOverallScore(runner, meters) {
  // Determine the timeScore based on the distance (sprint or non-sprint)
  let timeScore = 0;
  if (meters <= 1200 || isDistanceCloseEnough(meters, 1200)) {
    // Use quickest time if it's a sprint race
    timeScore = runner.quickestTimes?.score || 0;
  } else {
    // Use average time on distance for non-sprint
    timeScore = runner.averageTimeOnDistance?.score || 0;
  }

  // Burst Potential
  const burstScore = runner.burstPotential?.score || 0;

  // Distance Suitability
  const distanceScore = runner.distanceSuitability?.score || 0;

  // Condition Suitability
  const conditionScore = runner.conditionSuitability?.score || 0;

  // Style Suitability
  const styleScore = runner.styleSuitability?.score || 0;

  // Current Form
  const formScore = runner.currentForm?.score || 0;

  return {
    score: distanceScore + conditionScore + burstScore + timeScore,// + formScore + styleScore
    breakdown: {
      distance: distanceScore !== null ? distanceScore : 'N/A',
      condition: conditionScore !== null ? conditionScore : 'N/A',
      burst: burstScore !== null ? burstScore : 'N/A',
      style: styleScore !== null ? styleScore : 'N/A',
      avgTime: timeScore !== null ? timeScore : 'N/A',
      form: formScore !== null ? formScore : 'N/A'
    },
    weights: runner.scoreWeights
  };
}

/**
 * Scores how suitable a runner is for given distance and condition,
 * based on past runs' style scores and style suitability matrix.
 * 
 * @param {object} runner - runner object with runs array
 * @param {number} meters - target race distance in meters
 * @param {string} condition - target track condition
 * @returns {object} { suitabilityScore: number, sampleSize: number }
 */
function assessStyleSuitability(runner, meters, condition) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.styleWeight;
    const fallbackDisplay = fallbackRawScore.toFixed(2).toString();// + "<br>" + fallbackScore.toFixed(2).toString();

  if (!runner.runs || runner.runs.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      sampleSize: 0,
      runs: [],
      display: fallbackDisplay,
      style: ""
    };
  }

  const distCategory = categorizeDistance(meters);
  const condCategory = normalizeCondition(condition);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const run of runner.runs) {
    if (!run.style || typeof run.styleScore !== 'number') continue;

    const style = run.style.toLowerCase();
    const styleData = styleSuitabilityMatrix[style];
    if (!styleData) continue;

    const distSuit = styleData.distance[distCategory] ?? 0.5;
    const condSuit = styleData.condition[condCategory] ?? 0.5;

    const runSuitability = (distSuit + condSuit) / 2;

    weightedSum += runSuitability * run.styleScore;
    totalWeight += run.styleScore;
  }

  if (totalWeight === 0) {
    return {
      suitability: "fair",
      weighting: "fair",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      sampleSize: 0,
      runs: [],
      display: fallbackDisplay,
      style: `background: linear-gradient(to right, ${suitabilityColors.fair} 0%, ${suitabilityColors.fair} 50%, ${suitabilityColors.fair} 50%, ${suitabilityColors.fair} 100%)`
    };
  }

  const avgSuitability = weightedSum / totalWeight;
  const scaledScore = avgSuitability * 100;

  let suitability = "poor";
  if (scaledScore >= 85) suitability = "great";
  else if (scaledScore >= 70) suitability = "good";
  else if (scaledScore >= 55) suitability = "fair";
  else if (scaledScore < 40) suitability = "bad";

  const score = scaledScore * weights.styleWeight;
  const weighting = getWeightedSuitabilityLabel(score, weights.styleWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];

  return {
    suitability,
    weighting,
    score,
    rawScore: scaledScore,
    sampleSize: runner.runs.length,
    runs: runner.runs,
    display: scaledScore.toFixed(2),// + "<br>" + score.toFixed(2),
    style: `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`
  };
}

function calculateAvgTimeScore(runner, meters) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.avgTimeWeight;
  const fallbackDisplay = fallbackRawScore.toFixed(2) + "<br>" + fallbackScore.toFixed(2);

  if (!runner.runs || runner.runs.length === 0) {
    return {
      score: fallbackScore,
      rawScore: fallbackRawScore,
      avgTime: null,
      runs: [],
      weighting: "none",
      suitability: "none",
      style: 'background: white',
      display: fallbackDisplay
    };
  }

  const relevantRuns = runner.runs.filter(run =>
    typeof run.time === 'number' &&
    typeof run.adjTimeDistAndCondOnly === 'number' &&
    run.isRelevantDistance &&
    (isDistanceCloseEnough(run.distance, 1200) || run.fieldSizeValue >= 6) // ⬅️ Exclude runs from small fields
  );

  const validTimes = relevantRuns.map(run => run.adjTimeDistAndCondOnly);

  if (validTimes.length === 0) {
    return {
      score: fallbackScore,
      rawScore: fallbackRawScore,
      avgTime: null,
      runs: [],
      suitability: "fair",
      weighting: "fair",
      style: `background: linear-gradient(to right, ${suitabilityColors["fair"]} 0%, ${suitabilityColors["fair"]} 50%, ${suitabilityColors["fair"]} 50%, ${suitabilityColors["fair"]} 100%)`,
      display: fallbackDisplay
    };
  }

  const { min, max } = getExpectedTimeRange(meters);
  const clampedTimes = validTimes.map(t => Math.min(Math.max(t, min), max));
  const avgTime = clampedTimes.reduce((a, b) => a + b, 0) / clampedTimes.length;
  let rawScore = (1 - ((avgTime - min) / (max - min))) * 100;

  // Suitability rating
  let suitability = "poor";
  if (rawScore >= 85) {
    suitability = "great";
  } else if (rawScore >= 70) {
    suitability = "good";
  } else if (rawScore >= 55) {
    suitability = "fair";
  } else if (rawScore < 40) {
    suitability = "bad";
  }

  // Optional consistency logic for sprint races
  // if (meters <= 1200 || isDistanceCloseEnough(meters, 1200))
  //   rawScore = applyConsistencyBonus(rawScore, runner, meters);

  const score = rawScore * weights.avgTimeWeight;
  const weighting = getWeightedSuitabilityLabel(score, weights.avgTimeWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];

  const style = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  return {
    score,
    rawScore,
    avgTime,
    suitability,
    weighting,
    runs: relevantRuns,
    style,
    display: rawScore.toFixed(2) + "<br>" + score.toFixed(2)
  };
}

function recalculateTimeScore(runners, allRuns, meters) {
  for (let i = 0; i < 3 && i < runners.length; i++) {
    const runner = runners[i];

    runner.quickestTimes = calculateRelativeTimeScoreFromAllRuns(runner, allRuns, meters);
    runner.overAll = calculateOverallScore(runner, meters);
  }
}

function calculateRelativeTimeScoreFromAllRuns(runner, allRuns, meters) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.avgTimeWeight;
  const fallbackDisplay = fallbackRawScore.toFixed(2) + "<br>" + fallbackScore.toFixed(2);

  // Filter out all runs for the given runner and the correct distance
  const relevantRuns = allRuns.filter(run =>
    run.runnerId === runner.id &&
    typeof run.adjTimeDistAndCondOnly === 'number' &&
    run.adjTimeDistAndCondOnly <= getExpectedTimeRange(meters).max &&
    run.adjTimeDistAndCondOnly >= (getExpectedTimeRange(meters).min - 1) // Clamp with 1s leeway
  );

  if (relevantRuns.length === 0) {
    return {
      score: fallbackScore,
      rawScore: fallbackRawScore,
      time: null,
      runs: [],
      suitability: "none",
      weighting: "none",
      style: 'background: white',
      display: fallbackDisplay
    };
  }

  // --- Recency (max 30)
  const now = new Date();
  const mostRecentRunDate = relevantRuns.reduce((latest, run) => {
    const d = run.parsedDate;
    return d > latest ? d : latest;
  }, new Date(0));
  const ageInDays = (now - mostRecentRunDate) / (1000 * 60 * 60 * 24);
  let recencyScore = 0;
  if (ageInDays <= 30) recencyScore = 30;
  else if (ageInDays <= 60) recencyScore = 20;
  else if (ageInDays <= 90) recencyScore = 10;

  // --- Placement Strength (max 25)
  const runRanks = relevantRuns
    .sort((a, b) => a.adjTimeDistAndCondOnly - b.adjTimeDistAndCondOnly) // ascending by time
    .map((run, index) => index + 1); // rank starts at 1
  const bestRank = Math.min(...runRanks);
  let placementScore = 0;
  if (bestRank === 1) placementScore = 25;
  else if (bestRank === 2) placementScore = 20;
  else if (bestRank === 3) placementScore = 15;
  else if (bestRank === 4) placementScore = 10;
  else if (bestRank === 5) placementScore = 5;

  // --- Volume of Top Runs (max 25)
  let volumeScore = 0;
  const top5Runs = relevantRuns.filter(run => runRanks.indexOf(runRanks[relevantRuns.indexOf(run)]) <= 5);
  const top10Runs = relevantRuns.filter(run => runRanks.indexOf(runRanks[relevantRuns.indexOf(run)]) > 5 && runRanks.indexOf(runRanks[relevantRuns.indexOf(run)]) <= 10);
  const top20Runs = relevantRuns.filter(run => runRanks.indexOf(runRanks[relevantRuns.indexOf(run)]) > 10 && runRanks.indexOf(runRanks[relevantRuns.indexOf(run)]) <= 20);

  if (top5Runs.length === 1) volumeScore = 10;
  else if (top5Runs.length >= 2) volumeScore = 15;
  else if (top10Runs.length === 1) volumeScore = 5;
  else if (top10Runs.length >= 2) volumeScore = 8;
  else if (top20Runs.length > 0) volumeScore = 2;

  // --- Consistency Bonus (max 10)
  let consistencyScore = 0;
  const isSprint = meters <= 1200 || isDistanceCloseEnough(meters, 1200);
  if (isSprint && relevantRuns.length >= 2) {
    const times = relevantRuns.map(run => run.adjTimeDistAndCondOnly).sort((a, b) => a - b);
    const spread = times[times.length - 1] / times[0];
    if (spread <= 1.10) {
      if (relevantRuns.length >= 3) consistencyScore = 10;
      else consistencyScore = 5;
    }
  }

  // --- Total Raw Score
  let rawScore = recencyScore + placementScore + volumeScore + consistencyScore;

  // --- Weighted score
  const score = rawScore * weights.avgTimeWeight;

  // --- Suitability
  let suitability = "poor";
  if (rawScore >= 85) suitability = "great";
  else if (rawScore >= 70) suitability = "good";
  else if (rawScore >= 55) suitability = "fair";
  else if (rawScore < 40) suitability = "bad";

  const weighting = getWeightedSuitabilityLabel(score, weights.avgTimeWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];
  const style = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  return {
    score,
    rawScore,
    time: relevantRuns[0].adjTimeDistAndCondOnly,
    suitability,
    weighting,
    runs: relevantRuns,
    style,
    display: rawScore.toFixed(2) + "<br>" + score.toFixed(2)
  };
}

function assessBurstPotential(runner, condition) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.burstWeight;
  const fallbackDisplay = fallbackRawScore.toFixed(2) + "<br>" + fallbackScore.toFixed(2);
  const minMps = 13;
  const maxMps = 19;

  if (!runner.runs || runner.runs.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      sampleSize: 0,
      avgMps: null,
      runs: [],
      display: fallbackDisplay,
      style: ""
    };
  }

  const currCond = normalizeCondition(condition);

  const relevantRuns = runner.runs.filter(run => {
    const runCond = normalizeCondition(run.condition);
    return (
      run.isRelevantDistance &&
      isSimilarCondition(runCond, currCond) &&
      (isDistanceCloseEnough(run.distance, 1200) || run.fieldSizeValue >= 6)
    );
  });

  const burstRuns = relevantRuns
    .filter(run => typeof run.finishingSpeed?.fromAdjDistAndCond?.mps === "number")
    .map(run => run.finishingSpeed.fromAdjDistAndCond.mps);

  if (burstRuns.length === 0) {
    return {
      suitability: "fair",
      weighting: "fair",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      sampleSize: 0,
      avgMps: null,
      runs: [],
      display: fallbackDisplay,
      style: `background: linear-gradient(to right, ${suitabilityColors.fair} 0%, ${suitabilityColors.fair} 50%, ${suitabilityColors.fair} 50%, ${suitabilityColors.fair} 100%)`
    };
  }

  const topBurst = burstRuns.sort((a, b) => b - a).slice(0, 2);
  const burstScore = topBurst.reduce((sum, mps) => sum + mps, 0) / topBurst.length;
  const avgMps = burstRuns.reduce((sum, mps) => sum + mps, 0) / burstRuns.length;

  let rawScore = ((burstScore - minMps) / (maxMps - minMps)) * 100;
  rawScore = Math.max(0, Math.min(100, rawScore)); // clamp 0–100

  let suitability = "poor";
  if (rawScore >= 85) suitability = "great";
  else if (rawScore >= 70) suitability = "good";
  else if (rawScore >= 55) suitability = "fair";
  else suitability = "bad";

  const score = rawScore * weights.burstWeight;
  const weighting = getWeightedSuitabilityLabel(score, weights.burstWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];

  return {
    suitability,
    weighting,
    score,
    rawScore,
    sampleSize: burstRuns.length,
    avgMps,
    runs: relevantRuns,
    display: rawScore.toFixed(2) + "<br>" + score.toFixed(2),
    style: `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`
  };
}

function assessDistanceSuitability(runner, meters) {
  const distanceTolerance = getDistanceTolerance(meters);
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.distanceWeight;
  const fallbackDisplay = fallbackRawScore.toFixed(2) + "<br>" + fallbackScore.toFixed(2);

  if (!runner.runs || runner.runs.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      runs: [],
      style: 'background: white'
    };
  }

  const LONG_RACE_THRESHOLD = 1800;
  const isLongRace = meters >= LONG_RACE_THRESHOLD;

  const relevantRuns = runner.runs.filter(run =>
    typeof run.distance === 'number' &&
    typeof run.competitiveScore === 'number' &&
    (isDistanceCloseEnough(run.distance, 1200) || run.fieldSizeValue >= 6) &&
    (
      isLongRace
        ? (run.isRelevantDistance || run.distance >= LONG_RACE_THRESHOLD)
        : run.isRelevantDistance
    )
  );

  const recentRuns = relevantRuns.filter(run => isWithinLast97Days(run.parsedDate));
  const useRuns = recentRuns.length >= 4 ? recentRuns : relevantRuns;

  if (useRuns.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      runs: [],
      style: 'background: white'
    };
  }

  let weightedScoreSum = 0;
  let totalWeight = 0;

  for (const run of useRuns) {
    const distDiff = Math.abs(run.distance - meters);

    let distWeight;
    if (isLongRace && run.distance >= meters) {
      distWeight = 1;
    } else {
      distWeight = Math.max(1 - Math.min(distDiff / distanceTolerance, 1), 0.15); // add floor
    }

    weightedScoreSum += run.competitiveScore * distWeight;
    totalWeight += distWeight;
  }

  if (totalWeight === 0) {
    return {
      suitability: "fair",
      weighting: "fair",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      runs: useRuns,
      style: `background: linear-gradient(to right, ${suitabilityColors["fair"]} 0%, ${suitabilityColors["fair"]} 50%, ${suitabilityColors["fair"]} 50%, ${suitabilityColors["fair"]} 100%)`,
      display: fallbackDisplay
    };
  }

  let rawScore = weightedScoreSum / totalWeight;

  let suitability = "poor";
  if (rawScore >= 85) suitability = "great";
  else if (rawScore >= 70) suitability = "good";
  else if (rawScore >= 55) suitability = "fair";
  else if (rawScore < 40) suitability = "bad";

  const score = rawScore * weights.distanceWeight;
  const weighting = getWeightedSuitabilityLabel(score, weights.distanceWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];

  const style = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  return {
    suitability,
    weighting,
    score,
    rawScore,
    runs: useRuns,
    style,
    display: rawScore.toFixed(2) + "<br>" + score.toFixed(2)
  };
}

function assessConditionSuitability(runner, currCond) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.conditionWeight;
  const fallbackDisplay = fallbackRawScore.toFixed(2) + "<br>" + fallbackScore.toFixed(2);

  if (!runner.runs || runner.runs.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      confidence: 0,
      sampleSize: 0,
      runs: [],
      style: 'background: white'
    };
  }

  const normalizeCondition = cond => cond?.toLowerCase().replace(/[^a-z]/g, '') || '';

  const conditionGroups = {
      firm: ["fast", "firm", "good", "awt"],
      wet: ["soft", "slow", "heavy", "muddy", "sloppy"]
  };

  const currentCond = normalizeCondition(currCond);
  const currGroup = conditionGroups.firm.includes(currentCond)
    ? conditionGroups.firm
    : conditionGroups.wet;

  // Step 1: Grab all compatible condition runs with valid competitiveScore and min field size
  const allConditionRuns = runner.runs.filter(run => {
    const runCond = normalizeCondition(run.condition);
    return currGroup.includes(runCond) &&
      typeof run.competitiveScore === 'number' &&
      !isNaN(run.competitiveScore) &&
      (isDistanceCloseEnough(run.distance, 1200) || run.fieldSizeValue >= 6);
  });

  // Step 2: Prefer only runs in the last 97 days if there are 4 or more
  const recentConditionRuns = allConditionRuns.filter(run =>
    isWithinLast97Days(run.parsedDate)
  );

  const useRuns = recentConditionRuns.length >= 4 ? recentConditionRuns : allConditionRuns;

  if (useRuns.length === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      confidence: 0,
      sampleSize: 0,
      runs: [],
      style: 'background: white'
    };
  }

  let totalScore = 0;
  let totalWeight = 0;

  for (const run of useRuns) {
    const runCond = normalizeCondition(run.condition);
    const weight = getConditionWeight(currentCond, runCond);
    if (weight === 0) continue;
    totalScore += run.competitiveScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return {
      suitability: "none",
      weighting: "none",
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      confidence: 0,
      sampleSize: useRuns.length,
      runs: [],
      style: 'background: white'
    };
  }

  const baseScore = totalScore / totalWeight;
  const confidenceFactor = Math.min(1, Math.log2(useRuns.length + 1) / 3);
  const adjustedScore = baseScore * (0.8 + 0.2 * confidenceFactor);
  const score = adjustedScore * weights.conditionWeight;

  const suitability =
    adjustedScore >= 85 ? "great" :
    adjustedScore >= 70 ? "good" :
    adjustedScore >= 55 ? "fair" :
    adjustedScore >= 40 ? "poor" : "bad";

  const weighting = getWeightedSuitabilityLabel(score, weights.conditionWeight);
  const confidence = Math.round(confidenceFactor * 100) / 100;
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];

  const style = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  return {
    suitability,
    weighting,
    score,
    rawScore: adjustedScore,
    confidence,
    sampleSize: useRuns.length,
    runs: useRuns,
    style,
    display:
      adjustedScore.toFixed(2) + "<br>" +
      score.toFixed(2) + "<br>" +
      " (" + confidence.toFixed(2) + ")"
  };
}

function assessCurrentForm(runner) {
  const weights = runner.scoreWeights;
  const fallbackRawScore = 25;
  const fallbackScore = fallbackRawScore * weights.formWeight;
    const fallbackDisplay = fallbackRawScore.toFixed(2);// + "<br>" + fallbackScore.toFixed(2);

  if (!runner.runs || runner.runs.length === 0) {
    return {
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      sampleSize: 0,
      runs: [],
      style: 'background: white'
    };
  }

  let lastRunDate = null;
  let formScores = [];
  let usedRuns = [];
  let count = 0;

  for (const run of runner.runs) {
    if (typeof run.competitiveScore !== "number" || !run.parsedDate) continue;
    if (!run.fieldSizeValue || run.fieldSizeValue < 6) continue;

    const runDate = run.parsedDate;
    if (lastRunDate && (lastRunDate - runDate) / (1000 * 60 * 60 * 24) > 60) {
      break; // More than 60 days break
    }

    const [placeStr, fieldStr] = run.place.split("/");
    const place = parseInt(placeStr);
    const fieldSize = parseInt(fieldStr);

    if (!place || !fieldSize || fieldSize <= 1) continue;

    const placingScore = 1 - (place - 1) / (fieldSize - 1);
    const marginPenalty = run.marginValue / 10;

    const rawScore = placingScore + marginPenalty;

    formScores.push(rawScore);
    usedRuns.push(run);

    lastRunDate = runDate;
    count++;
    if (count >= 5) break;
  }

  if (formScores.length === 0) {
    return {
      score: fallbackScore,
      rawScore: fallbackRawScore,
      display: fallbackDisplay,
      sampleSize: 0,
      runs: [],
      style: 'background: white'
    };
  }

  const rawAvg = formScores.reduce((a, b) => a + b, 0) / formScores.length;

  // Map rawAvg (possibly < 0 or > 2) into a centered score
  const scaledScore = ((rawAvg + 1) / 2) * 100;
  const score = scaledScore * weights.formWeight;
  const suitability =
    scaledScore >= 85 ? "great" :
    scaledScore >= 70 ? "good" :
    scaledScore >= 55 ? "fair" :
    scaledScore >= 40 ? "poor" : "bad";

  const weighting = getWeightedSuitabilityLabel(score, weights.formWeight);
  const leftColor = suitabilityColors[suitability];
  const rightColor = suitabilityColors[weighting];
  const style = `background: linear-gradient(to right, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;

  return {
    suitability,
    weighting,
    rawScore: scaledScore,
    score,
    display: scaledScore.toFixed(2),// + "<br>" + score.toFixed(2),
    sampleSize: formScores.length,
    runs: usedRuns,
    style
  };
}

function rankRunnersByAttributes(runners) {
  const attributes = ['avgTime', 'burst', 'distance', 'condition', 'style', 'form'];

  // Rank each attribute individually
  attributes.forEach(attr => {
    const validRunners = runners.filter(r => {
      const val = r.overAll?.breakdown?.[attr];
      return typeof val === 'number' && !isNaN(val);
    });

    const sorted = [...validRunners].sort((a, b) => b.overAll.breakdown[attr] - a.overAll.breakdown[attr]);

    sorted.forEach((runner, index) => {
      if (!runner.overAll.ranks) runner.overAll.ranks = {};
      runner.overAll.ranks[attr] = index + 1;
    });
  });

  // Rank overall
  const overallSorted = [...runners].sort((a, b) => b.overAll.score - a.overAll.score);
  overallSorted.forEach((runner, index) => {
    if (!runner.overAll.ranks) runner.overAll.ranks = {};
    runner.overAll.ranks.overall = index + 1;
  });

  // Build display string
  runners.forEach(runner => {
    if (!runner.overAll.ranks) runner.overAll.ranks = {};

    const displayRanks = attributes.map(attr => {
      const rank = runner.overAll.ranks[attr];
      return (typeof rank === 'number') ? rank : 'N/A';
    });

    const total = displayRanks.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    runner.overAll.display = `(${total}) ${displayRanks.join('-')}`;
  });
}

// Adjusted average speed (m/s) based on current vs historical race condition
function calculateAverageSpeedAdjustedForCondition(runner, currCondition) {
  if (!runner.runs || runner.runs.length === 0) return null;

  let totalSpeed = 0;
  let count = 0;

  for (const run of runner.runs) {
    if (typeof run.time !== 'number' || typeof run.distance !== 'number') continue;

    const adjustedTimeWithWeight = adjustTimeForWeightDifference(run.time, run.weight, runner.weight, run.distance, currCondition);
    const adjustedTime = adjustTimeForCondition(adjustedTimeWithWeight, run.condition, currCondition, run.distance);

    if (!adjustedTime || adjustedTime <= 0) continue;

    const speed = run.distance / adjustedTime;
    totalSpeed += speed;
    count++;
  }

  return count > 0 ? Math.round((totalSpeed / count) * 1000) / 1000 : null;
}

// returns average m/s speed

function adjustTimeByDistance(time, distance, targetDistance) {
  const minAllowedTime = getMinTimeForDistance(distance);
  if (time < minAllowedTime && minAllowedTime - time >= 1) return null;//Allow a 1 sec leeway

  const rawDiff = distance - targetDistance;

  if (distance < targetDistance) time += Math.abs(rawDiff) * 0.076;
  if (distance > targetDistance) time -= rawDiff * 0.061;

  return time;
}

function getFieldFactor(fieldSize) {
    const map = {
        2: 0.3, 3: 0.3, 4: 0.3,
        5: 0.35, 6: 0.4, 7: 0.48, 8: 0.58, 9: 0.7,
        10: 0.84, 11: 1.0, 12: 1.18, 13: 1.38,
        14: 1.6, 15: 1.84, 16: 2.1
    };
    return map[fieldSize] || 1;
}

function calculateCompetitiveScore(run) {
    if (!run || !run.finishedRace || typeof run.marginValue !== 'number') {
        return null;
    }

    const margin = run.marginValue;
    let fieldSize = run.fieldSizeValue;

    if (!fieldSize) return null;

    // Clamp margin
    const clampedMargin = Math.min(Math.max(margin, -10), 5);

    // Cap field size at 16 for diminishing returns
    fieldSize = Math.min(fieldSize, 16);

    const minScore = 30;
    const maxScore = 95;  // Max before buffer zone for exceptional wins

    // Calculate normalized margin scale (0 to 1)
    // Wins occupy top 25% (0.75 to 1), Losses bottom 75% (0 to 0.75)
    let normalizedMargin;
    if (clampedMargin >= 0) {
        normalizedMargin = 0.75 + (clampedMargin / 5) * 0.25;
    } else {
        normalizedMargin = 0.75 * (1 + clampedMargin / 10); // clampedMargin negative
    }

    const fieldFactor = getFieldFactor(fieldSize); // Your nonlinear curve
    const steepness = 5 + (fieldFactor / 2.1) * 10; // Normalized to 5–15 range

    // Midpoint of logistic curve at 0.5 normalized scale
    const midpoint = 0.5;

    // Logistic function for smooth decay
    const logisticValue = 1 / (1 + Math.exp(-steepness * (normalizedMargin - midpoint)));

    // Base score scaled between minScore and maxScore
    let baseScore = minScore + logisticValue * (maxScore - minScore);

    // Buffer zone for truly dominant wins (margin >=5 AND fieldSize >=14)
    if (margin >= 5 && fieldSize >= 14) {
        // Linear interpolation in buffer zone 95 to 100
        const dominanceRatio = Math.min((margin - 5) / (5 - 5 + 1e-6), 1); // basically 1 if margin=5+
        const fieldSizeRatio = (fieldSize - 14) / (16 - 14);
        baseScore = 95 + 5 * dominanceRatio * fieldSizeRatio;
    }

    // Cap score at 100 and floor at minScore
    baseScore = Math.min(100, Math.max(minScore, baseScore));

    return Math.round(baseScore * 10) / 10;
}

// Adjust time based on condition and distance
// Adjusted time function using delta between run condition and current race condition
function adjustTimeForCondition(time, runCondition, currentCondition, distance) {
  const minAllowedTime = getMinTimeForDistance(distance);
  if (time < minAllowedTime && minAllowedTime - time >= 1) return null;//Allow a 1 sec leeway

  const runBias = conditionAdjustments[normalizeCondition(runCondition)] ?? 0;
  const currentBias = conditionAdjustments[normalizeCondition(currentCondition)] ?? 0;

  const adjustmentFactorPer100m = runBias - currentBias;
  const adjustment = adjustmentFactorPer100m * (distance / 100);

  return time - adjustment;
}

function adjustTimeForWeightDifference(time, runWeight, currWeight, distance, condition) {
  if (
    typeof time !== 'number' || time <= 0 ||
    typeof distance !== 'number' || distance <= 0 ||
    runWeight == null || currWeight == null
  ) {
    return time;
  }

  const normalizeCondition = (cond) =>
    cond?.toLowerCase().replace(/[^a-z]/g, '') || '';

    const perMeterPenalties = {
        muddy: 0.00055,
        sloppy: 0.00053,
        heavy: 0.0005,
        hvy: 0.0005,
        soft: 0.0004,
        slow: 0.00035,
        good: 0.0003,
        awt: 0.0002,
        firm: 0.00015,
        fast: 0.0001,
    };


  const normCond = normalizeCondition(condition);
  const perMeterPenalty = perMeterPenalties[normCond] ?? 0.00025;

  const weightDiff = currWeight - runWeight;
  const adjustment = weightDiff * perMeterPenalty * distance;

  return time + adjustment;
}

function adjustForWeightSensitivity(runner) {
  const currentWeight = runner.weight;
  const runs = runner.runs;

  const similarWeightRuns = runs.filter(r => 
    Math.abs(r.weight - currentWeight) <= 1 && r.weight !== currentWeight
  );

  const avgMpsAtCurrentWeight = similarWeightRuns.length
    ? similarWeightRuns.reduce((sum, r) => sum + r.distAndCondMps, 0) / similarWeightRuns.length
    : null;

  if (!avgMpsAtCurrentWeight) return runner;

  const THRESHOLD_PCT = 0.02; // 2%

  runs.forEach(run => {
    if (run.weight === currentWeight) return;

    const mpsDiff = run.distAndCondMps - avgMpsAtCurrentWeight;
    const percentDiff = Math.abs(mpsDiff) / avgMpsAtCurrentWeight;

    if (percentDiff <= THRESHOLD_PCT) {
      run.adjTimeWithWeight = run.adjTimeDistAndCondOnly;
      run.distCondAndWeightMps = run.distAndCondMps;
    }
  });

  return runner;
}

function estimateFinishingSpeed(distance, { adjTimeDistOnly, adjTimeDistAndCondOnly }) {
    if (!adjTimeDistOnly || !distance) return null;

  const minAllowedTime = getMinTimeForDistance(distance);
    if (adjTimeDistOnly < minAllowedTime) return null;

  const finishingSection = getFinishingSection(distance);

  const results = {
    finishingSection
  };

  // Helper to calculate speed block
  const calcSpeed = (timeValue) => {
    const avgSpeed = distance / timeValue;
    const sectionTimeEstimate = finishingSection / avgSpeed;
    const finishingSpeed = finishingSection / sectionTimeEstimate;

    return {
      mps: +finishingSpeed.toFixed(2),
      kmh: +(finishingSpeed * 3.6).toFixed(2)
    };
  };

  if (adjTimeDistOnly != null) {
    results.fromAdjDist = {
      adjustedTime: +adjTimeDistOnly.toFixed(2),
      ...calcSpeed(adjTimeDistOnly)
    };
  }

  if (adjTimeDistAndCondOnly != null) {
    results.fromAdjDistAndCond = {
      adjustedTime: +adjTimeDistAndCondOnly.toFixed(2),
      ...calcSpeed(adjTimeDistAndCondOnly)
    };
  }

  return results;
  /*SAMPLE OUTPUT
    {
    finishingSection: 260,
    fromAdjDist: {
      adjustedTime: 70.5,
      mps: 15.1,
      kmh: 54.36
    },
    fromAdjDistAndCond: {
      adjustedTime: 69.1,
      mps: 15.4,
      kmh: 55.44
    }
  }
  */
}

function getFinishingSection(distance) {
  for (const range of finishingSectionMap) {
    const minOk = range.min === null || distance >= range.min;
    const maxOk = range.max === null || distance <= range.max;

    if (minOk && maxOk) {
      return range.finishingSection;
    }
  }

  // fallback — should rarely be hit if map is complete
  return Math.round(distance * 0.22);
}

function getSignedMargin(run) {
  if (!run || typeof run.margin !== 'number' || !run.place) return 0;

  const [placeStr] = run.place.split('/');
  const place = parseInt(placeStr, 10);

  const maxNegativeMargin = 15; // cap losing margin at -15 lengths

  if (place === 1 || placeStr.toLowerCase().indexOf("win") > 0) {
    return run.margin; // positive margin if won
  } else if (run.margin == 0 && place !== 1) {
    return -maxNegativeMargin;
  } else {
    // Cap negative margin to -maxNegativeMargin
    return -Math.min(Math.abs(run.margin), maxNegativeMargin);
  }
}

function parsePlacing(run) {
  if (!run || !run.place || typeof run.place !== "string") {
    run.placeValue = null;
    run.fieldSizeValue = null;
    run.finishedRace = false;
    return;
  }

  const [placeStr, fieldStr] = run.place.split("/").map(s => parseInt(s.trim(), 10));

  run.placeValue = !isNaN(placeStr) ? placeStr : null;
  run.fieldSizeValue = !isNaN(fieldStr) ? fieldStr : null;

  // Only flag as finished if both numbers are valid and place is within field
  run.finishedRace =
    typeof run.placeValue === "number" &&
    typeof run.fieldSizeValue === "number" &&
    run.placeValue >= 1 &&
    run.placeValue <= run.fieldSizeValue;
}

function inferRunStyle(sectionalPosition) {
  if (!sectionalPosition || sectionalPosition.length === 0) return 'unknown';

  const firstSection = sectionalPosition[0];
  const midSection = sectionalPosition[Math.floor(sectionalPosition.length / 2)];
  const lastSection = sectionalPosition[sectionalPosition.length - 1];

  if (firstSection <= 3) return 'leader';
  if (midSection <= 4) return 'mid';
  return 'closer';
}

function calculateStyleScore(run) {
  if (!run) return { style: 'unknown', totalScore: 0 };

  const style = inferRunStyle(run.sectionalPosition);
  const margin = run.marginValue ?? 0;

  // Defensive check: finishingSpeed might be null or missing
  // Use run.finishingSpeed.mps if finishingSpeed is an object, otherwise fallback to 0
  const finishingSpeedMps = (run.finishingSpeed && typeof run.finishingSpeed === 'object' && 'mps' in run.finishingSpeed)
    ? run.finishingSpeed.mps
    : (typeof run.finishingSpeed === 'number' ? run.finishingSpeed : 0);

  let baseScore = 0;
  switch (style) {
    case 'leader': baseScore = margin * 1.2; break;
    case 'mid': baseScore = margin * 1.0; break;
    case 'closer': baseScore = margin * 1.1; break;
    default: baseScore = margin; // fallback
  }

  const finishingSpeedBonus = finishingSpeedMps > 0 ? finishingSpeedMps * 2 : 0;
  const totalScore = baseScore + finishingSpeedBonus;

  return { style, score: Math.round(totalScore * 10) / 10 };
}

function classifyTimePerformance(run) {
  const { distance, adjTimeDistAndCondOnly } = run;
  if (!distance || !adjTimeDistAndCondOnly) return 'unknown';

  const ref = minTimePerDistanceMap.find(
    d => (d.min === null || distance >= d.min) &&
      (d.max === null || distance <= d.max)
  );

  if (!ref) return 'unknown';

  const minTime = ref.minTime;

  // Define tiers based on how far above baseline it is
  const diff = adjTimeDistAndCondOnly - minTime;

  if (diff <= 1.5) return 'elite';
  if (diff <= 3.5) return 'strong';
  if (diff <= 6) return 'average';
  if (diff <= 10) return 'slow';
  return 'very slow';
}

function calculateContextualFormScore(run) {
  const place = parseInt(run.place);
  const fieldSize = parseInt(run.fieldSize || run.runners || run.total || 12); // fallback to 12 if unknown
  const marginValue = parseFloat(run.marginValue ?? 0); // already signed: positive = win, negative = behind

  if (isNaN(place) || isNaN(fieldSize) || fieldSize <= 1) return 0.5;

  // Relative placing factor: 1 for 1st, 0 for last
  const placeFactor = 1 - (place - 1) / (fieldSize - 1);

  // Margin factor: positive margins (wins) get boosted, negative get penalized
  const marginFactor = 1 / (1 + Math.exp(-marginValue)); // sigmoid

  // Field bonus: slightly reward large fields
  const fieldBonus = fieldSize >= 12 ? 1.1 : fieldSize >= 9 ? 1.05 : 1;

  const score = placeFactor * marginFactor * fieldBonus;
  return Math.max(0, Math.min(1, score));
}

function getTimeStabilityScore(runs, filterRelevantRuns = false) {
  if (!Array.isArray(runs)) return null;

  const filteredRuns = filterRelevantRuns
    ? runs.filter(r => r.isRelevantDistance && typeof r.adjTimeDistOnly === "number")
    : runs.filter(r => typeof r.adjTimeDistOnly === "number");

  if (filteredRuns.length < 2) return null;

  const adjTimes = filteredRuns.map(r => r.adjTimeDistOnly);
  const mean = adjTimes.reduce((a, b) => a + b, 0) / adjTimes.length;
  const variance = adjTimes.reduce((sum, val) => sum + (val - mean) ** 2, 0) / adjTimes.length;
  const stdDev = Math.sqrt(variance);

  return {
    stdDev,
    count: adjTimes.length
  };
}

function applyConsistencyBonus(rawScore, runner, distance) {
  const stability = runner.timeStableScore;

  if (!stability) return rawScore;

  const { stdDev } = stability;
  let bonus = 0;

  if (stdDev <= 0.5) bonus = 5;
  else if (stdDev <= 1.0) bonus = 3;
  else if (stdDev <= 1.5) bonus = 1;

  return Math.min(100, rawScore + bonus);
}
//-----------------------------------------------------------------------------------------------------------------------------------------------

//Data References--------------------------------------------------------------------------------------------------------------------------------
// Configuration: time adjustment in seconds per 100 meters
// Distance-based expected time model (to be refined with data)
const conditionOrder = ["sloppy", "muddy", "heavy", "slow", "soft", "good", "firm", "fast", "awt"];
const suitabilityColors = {
  great: 'rgb(0, 180, 0)',          // darker green
  good: 'rgb(147, 255, 147)',       // light green
  fair: 'rgb(243, 243, 179)',       // yellow
  poor: 'rgb(255, 150, 150)',       // light red
  bad: 'rgb(200, 50, 50)',          // darker red
  none: 'white'                     // neutral / no data
};

// 🔸 Helper to classify distance type
function classifyDistanceType(meters, targetDistance) {
  if (!meters) return "unknown";

  // Use targetDistance if available to determine the type with tolerance
  if (targetDistance && isDistanceCloseEnough(meters, 1200)) return "sprint";
  if (targetDistance && isDistanceCloseEnough(meters, 1600)) return "mid";
  if (targetDistance) return "long";

  // Fallback: hard-coded categories
  if (meters <= 1200) return "sprint";
  if (meters <= 1600) return "mid";
  return "long";
}

function getConditionWeight(currentCond, runCond) {
    const normalize = cond => cond?.toLowerCase().replace(/[^a-z]/g, '') || '';
    const curr = normalize(currentCond);
    const run = normalize(runCond);

    if (!curr || !run) return 0;

    // If exact match, full score
    if (curr === run) return 1;

    // Check if both exist in similarity matrix
    if (conditionSimilarity[curr] && typeof conditionSimilarity[curr][run] === 'number') {
        return conditionSimilarity[curr][run];
    }

    // If no mapping, 0 penalty (meaning no similarity)
    return 0;
}

function getDynamicWeights(meters, condition) {
    const cond = normalizeCondition(condition);
    const isSprint = meters <= 1200;
    const isMid = meters > 1200 && meters <= 1600;
    const isLong = meters > 1600;

    // Updated base weights with formWeight removed and redistributed proportionally
    let weights = {
        distanceWeight: 0,
        conditionWeight: 0,
        burstWeight: 0,
        avgTimeWeight: 0
    };

    // Base weights with formWeight (previously 0.14, 0.18, 0.22) redistributed
    if (isSprint) {
        weights = {
            avgTimeWeight: 0.32,  // Most important in sprints
            distanceWeight: 0.28,  // Still quite important
            conditionWeight: 0.22,
            burstWeight: 0.18,  // Less important in sprints
            formWeight: 0      // Ignored in scoring
        };
    } else if (isMid) {
        weights = {
            distanceWeight: 0.25,
            conditionWeight: 0.23,
            burstWeight: 0.26,     // Slightly raised to emphasize finishing kick
            avgTimeWeight: 0.26,
            formWeight: 0
        };
    } else if (isLong) {
        weights = {
            distanceWeight: 0.265,
            conditionWeight: 0.275,
            burstWeight: 0.17,      // Slightly lower burst
            avgTimeWeight: 0.29,    // Slightly higher avgTime
            formWeight: 0
        };
    }

    // Updated condition deltas, with formWeight removed and rebalanced
    const conditionWeightDeltas = getConditionWeightDelta(condition, meters);
    const delta = conditionWeightDeltas[cond];
    if (delta) {
        for (const key in delta) {
            if (weights[key] !== undefined) {
                weights[key] += delta[key];
                weights[key] = Math.max(weights[key], 0); // clamp to 0
            }
        }

        // Final normalization to ensure all weights sum to 1
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const key in weights) {
            weights[key] /= total;
        }
    }

    return weights;
}
function getConditionWeightDelta(condition, meters) {
    const isSprint = meters <= 1200;

    switch (condition?.toLowerCase()) {
        case 'heavy':
        case 'hvy':
            return {
                conditionWeight: isSprint ? +0.06 : +0.12,
                avgTimeWeight: isSprint ? -0.06 : -0.12,
                burstWeight: -0.07,
                distanceWeight: +0.07
            };
        case 'muddy':
            return {
                conditionWeight: isSprint ? +0.05 : +0.10,
                avgTimeWeight: isSprint ? -0.05 : -0.10,
                burstWeight: -0.06,
                distanceWeight: +0.06
            };
        case 'sloppy':
            return {
                conditionWeight: isSprint ? +0.045 : +0.09,
                avgTimeWeight: isSprint ? -0.045 : -0.09,
                burstWeight: -0.05,
                distanceWeight: +0.05
            };
        case 'soft':
            return {
                conditionWeight: isSprint ? +0.035 : +0.07,
                avgTimeWeight: isSprint ? -0.035 : -0.07,
                burstWeight: -0.04,
                distanceWeight: +0.04
            };
        case 'slow':
            return {
                conditionWeight: isSprint ? +0.025 : +0.05,
                avgTimeWeight: isSprint ? -0.025 : -0.05,
                burstWeight: -0.02,
                distanceWeight: +0.02
            };
        case 'good':
            return {
                conditionWeight: -0.02,
                burstWeight: +0.03,
                avgTimeWeight: +0.01
            };
        case 'firm':
            return {
                conditionWeight: -0.03,
                burstWeight: +0.05,
                avgTimeWeight: +0.03
            };
        case 'fast':
            return {
                conditionWeight: -0.04,
                burstWeight: +0.06,
                avgTimeWeight: +0.03
            };
        case 'awt':
            return {
                conditionWeight: -0.07,
                avgTimeWeight: +0.03,
                distanceWeight: +0.04
            };
        default:
            return {}; // Fallback for unknown conditions
    }
}

function getExpectedTimeRange(distance) {
  for (const entry of minTimePerDistanceMap) {
    const minMatch = entry.min === null || distance >= entry.min;
    const maxMatch = entry.max === null || distance <= entry.max;
    if (minMatch && maxMatch) {
      const minTime = entry.minTime;

      // Use a larger window that scales with distance
      let buffer = 15;
      if (distance >= 1400 && distance < 1800) buffer = 20;
      else if (distance >= 1800 && distance < 2000) buffer = 25;
      else if (distance >= 2000) buffer = 30;

      const maxTime = minTime + buffer;
      return { min: minTime, max: maxTime };
    }
  }
  return { min: 50, max: 80 }; // fallback
}

function getMinTimeForDistance(distance) {
  for (const entry of minTimePerDistanceMap) {
    const withinMin = entry.min == null || distance >= entry.min;
    const withinMax = entry.max == null || distance <= entry.max;
    if (withinMin && withinMax) return entry.minTime;
  }
  return null;
}

const conditionAdjustments = {
    firm: 0.0000,
    fast: -0.0001,
    good: 0.0001,
    awt: 0.0002,
    soft: 0.0003,
    slow: 0.0004,
    heavy: 0.0005,
    hvy: 0.0005,
    muddy: 0.00055,   // slightly worse than heavy/hvy
    sloppy: 0.0006    // softest/slowest condition
};

const finishingSectionMap = [
  { min: null, max: 349, finishingSection: 80 },
  { min: 350, max: 399, finishingSection: 90 },
  { min: 400, max: 449, finishingSection: 100 },
  { min: 450, max: 499, finishingSection: 110 },
  { min: 500, max: 549, finishingSection: 120 },
  { min: 550, max: 599, finishingSection: 130 },
  { min: 600, max: 649, finishingSection: 140 },
  { min: 650, max: 699, finishingSection: 150 },
  { min: 700, max: 749, finishingSection: 160 },
  { min: 750, max: 799, finishingSection: 170 },
  { min: 800, max: 849, finishingSection: 180 },
  { min: 850, max: 899, finishingSection: 190 },
  { min: 900, max: 949, finishingSection: 200 },
  { min: 950, max: 999, finishingSection: 210 },
  { min: 1000, max: 1049, finishingSection: 220 },
  { min: 1050, max: 1099, finishingSection: 230 },
  { min: 1100, max: 1149, finishingSection: 240 },
  { min: 1150, max: 1199, finishingSection: 250 },
  { min: 1200, max: 1249, finishingSection: 260 },
  { min: 1250, max: 1299, finishingSection: 270 },
  { min: 1300, max: 1349, finishingSection: 280 },
  { min: 1350, max: 1399, finishingSection: 290 },
  { min: 1400, max: 1449, finishingSection: 300 },
  { min: 1450, max: 1499, finishingSection: 310 },
  { min: 1500, max: 1549, finishingSection: 320 },
  { min: 1550, max: 1599, finishingSection: 330 },
  { min: 1600, max: 1649, finishingSection: 340 },
  { min: 1650, max: 1699, finishingSection: 350 },
  { min: 1700, max: 1749, finishingSection: 360 },
  { min: 1750, max: 1799, finishingSection: 370 },
  { min: 1800, max: 1899, finishingSection: 380 },
  { min: 1900, max: 1999, finishingSection: 390 },
  { min: 2000, max: null, finishingSection: 400 }, // All distances >= 2000
];

const conditionSimilarity = {
    fast: { fast: 1.0, firm: 0.95, good: 0.9, awt: 0.8 },
    firm: { fast: 0.95, firm: 1.0, good: 0.9, awt: 0.8 },
    good: { fast: 0.9, firm: 0.9, good: 1.0, awt: 0.85 },
    awt: { fast: 0.8, firm: 0.8, good: 0.85, awt: 1.0 },

    soft: { soft: 1.0, heavy: 0.9, slow: 0.8, muddy: 0.75, sloppy: 0.7 },
    heavy: { heavy: 1.0, soft: 0.9, slow: 0.75, muddy: 0.7, sloppy: 0.65 },
    slow: { slow: 1.0, soft: 0.8, heavy: 0.75, muddy: 0.7, sloppy: 0.65 },
    muddy: { muddy: 1.0, soft: 0.75, heavy: 0.7, slow: 0.7, sloppy: 0.6 },
    sloppy: { sloppy: 1.0, soft: 0.7, heavy: 0.65, slow: 0.65, muddy: 0.6 }
};
// Adjusted minTimePerDistanceMap with 1s leeway added to allow for outstanding performance (i.e. reduce minTime by 1s)
const minTimePerDistanceMap = [
  { min: null, max: 349, minTime: 17.5 },
  { min: 350, max: 399, minTime: 21 },
  { min: 400, max: 449, minTime: 23 },
  { min: 450, max: 499, minTime: 25 },
  { min: 500, max: 549, minTime: 27 },
  { min: 550, max: 599, minTime: 29 },
  { min: 600, max: 649, minTime: 32 },
  { min: 650, max: 699, minTime: 35 },
  { min: 700, max: 749, minTime: 38 },
  { min: 750, max: 799, minTime: 41 },
  { min: 800, max: 849, minTime: 44 },
  { min: 850, max: 899, minTime: 47 },
  { min: 900, max: 949, minTime: 50 },
  { min: 950, max: 999, minTime: 53 },
  { min: 1000, max: 1049, minTime: 56 },
  { min: 1050, max: 1099, minTime: 59 },
  { min: 1100, max: 1149, minTime: 62 },
  { min: 1150, max: 1199, minTime: 65 },
  { min: 1200, max: 1249, minTime: 68 },
  { min: 1250, max: 1299, minTime: 71 },
  { min: 1300, max: 1349, minTime: 74 },
  { min: 1350, max: 1399, minTime: 77 },
  { min: 1400, max: 1449, minTime: 80 },
  { min: 1450, max: 1499, minTime: 83 },
  { min: 1500, max: 1549, minTime: 86 },
  { min: 1550, max: 1599, minTime: 89 },
  { min: 1600, max: 1649, minTime: 92 },
  { min: 1650, max: 1699, minTime: 95 },
  { min: 1700, max: 1749, minTime: 99 },
  { min: 1750, max: 1799, minTime: 103 },
  { min: 1800, max: 1899, minTime: 105 },
  { min: 1900, max: 1999, minTime: 110 },
  { min: 2000, max: null, minTime: 115 }
];

const styleSuitabilityMatrix = {
    leader: {
        distance: { short: 1.0, mid: 0.7, long: 0.4 },
        condition: {
            firm: 1.0,
            good: 0.9,
            awt: 0.85,
            soft: 0.6,
            heavy: 0.4,
            slow: 0.3,
            muddy: 0.3,
            sloppy: 0.25
        }
    },
    midPack: {
        distance: { short: 0.6, mid: 1.0, long: 0.9 },
        condition: {
            firm: 0.9,
            good: 1.0,
            awt: 0.9,
            soft: 0.8,
            heavy: 0.7,
            slow: 0.6,
            muddy: 0.55,
            sloppy: 0.5
        }
    },
    closer: {
        distance: { short: 0.4, mid: 0.8, long: 1.0 },
        condition: {
            firm: 0.8,
            good: 0.9,
            awt: 0.95,
            soft: 1.0,
            heavy: 0.9,
            slow: 0.8,
            muddy: 0.75,
            sloppy: 0.7
        }
    }
};
//Rendering functions--------------------------------------------------------------------------------------------------------------------------
function populateTopRuns(runs) {
  const topRunsTbody = document.querySelector("#top-runs-table tbody");
  topRunsTbody.innerHTML = "";

  if (!runs?.length) return;

  runs.forEach(run => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(run.number)}</td>
      <td class="runner-cell bold-text runnerName" data-number="${escapeHtml(run.number)}">${escapeHtml(run.name)}</td>
      <td>${escapeHtml(run.odds?.fixed?.display)}</td>
      <td>${escapeHtml(run.time?.toFixed(2))}</td>
      <td>${escapeHtml(run.adjTimeWithWeight?.toFixed(2))}</td>
      <td>${escapeHtml(run.finishingSpeed?.fromAdjDist?.mps?.toFixed(2))}</td>
      <td class="${run.weightClass}">${escapeHtml(run.weight ? run.weight : '') + (run.weightToday ? ' ('+ run.weightToday +')' : '')}</td>
      <td>${escapeHtml(run.date)}</td>
      <td>${escapeHtml(run.placeValue)}</td>
      <td>${escapeHtml(run.distance)}</td>
      <td>${escapeHtml(run.condition)}</td>
      <td>${escapeHtml(run.marginValue)}</td>
      <td>${escapeHtml(run.place)}</td>
    `;
    topRunsTbody.appendChild(tr);
  });
}

function populateTopPicks(runners) {
  const topPicksTbody = document.querySelector("#top-picks-table tbody");
  topPicksTbody.innerHTML = "";

  if (!runners?.length) return;
  runners.forEach(runner => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(runner.number)}</td>
      <td class="runner-cell bold-text runnerName" data-number="${escapeHtml(runner.number)}">
        ${escapeHtml(runner.name)}
      </td>
      <td>${escapeHtml(runner.odds?.fixed?.display)}</td>
      <td>${escapeHtml(runner.reasons.join("; "))}</td>
      <td>${escapeHtml(runner.downsides.join("; "))}</td>
    `;
    topPicksTbody.appendChild(tr);
  });
}

function setupComponentCheckboxes(results) {
  const checkboxes = document.querySelectorAll(".score-toggle");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      updateScoresAndSort(results);
    });
  });
}

function updateScoresAndSort(results) {
  const tbody = document.querySelector("#results-table tbody");
  const enabled = {
    distance: document.querySelector("#toggle-distance").checked,
    condition: document.querySelector("#toggle-condition").checked,
    burst: document.querySelector("#toggle-burst").checked,
    style: document.querySelector("#toggle-style").checked,
    avgTime: document.querySelector("#toggle-avgTime").checked,
    form: document.querySelector("#toggle-form").checked
  };

  const rows = Array.from(tbody.querySelectorAll("tr"));

  results.forEach((runner, index) => {
    const breakdown = runner.overAll?.breakdown;
    if (!breakdown) return;

    let score = 0;

    if (enabled.distance && typeof breakdown.distance === 'number') {
      score += breakdown.distance;
    }
    if (enabled.condition && typeof breakdown.condition === 'number') {
      score += breakdown.condition;
    }
    if (enabled.burst && typeof breakdown.burst === 'number') {
      score += breakdown.burst;
    }
    if (enabled.style && typeof breakdown.style === 'number') {
      score += breakdown.style;
    }
    if (enabled.avgTime && typeof breakdown.avgTime === 'number') {
      score += breakdown.avgTime;
    }
    if (enabled.form && typeof breakdown.form === 'number') {
      score += breakdown.form;
    }

    runner._tempScore = score; // Attach score directly to runner for consistent mapping
  });

  // Sort results (not DOM rows) based on new scores
  const sortedResults = [...results].sort((a, b) => {
    const aVal = a._tempScore || 0;
    const bVal = b._tempScore || 0;
    return bVal - aVal;
  });

  // Update DOM rows in the new sorted order
  tbody.innerHTML = "";
  sortedResults.forEach(runner => {
    const row = rows.find(r => r.querySelector(".runner-cell")?.dataset.number === runner.number);
    if (row) {
      row.children[0].textContent = runner._tempScore.toFixed(2);
      row.dataset.tempScore = runner._tempScore;
      tbody.appendChild(row);
    }
  });
}

function renderTableRows(results) {
  const ptbody = document.querySelector("#results-table tbody");
  results.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(row.overAll?.score?.toFixed(2))}</td>
      <td>${escapeHtml(row.number)}</td>
      <td class="runner-cell bold-text runnerName" data-number="${escapeHtml(row.number)}">
        <div class="display-background">${escapeHtml(row.name)}</div>
      </td>
      <td>${escapeHtml(row.odds?.fixed?.display)}</td>
      <td>${row.overAll?.display}</td>
      <td class="runner-cell" data-number="${escapeHtml(row.number)}" data-object="avgSpeed">${row.avgSpeed?.toFixed(2) ?? ''}</td>
      <td class="runner-cell" data-number="${escapeHtml(row.number)}" data-object="burstPotential">${row.burstPotential?.avgMps?.toFixed(2) ?? ''}</td>

      <td class="runner-cell bold-text ${row.averageTimeOnDistance?.suitability}" style="${row.averageTimeOnDistance?.style}" data-number="${escapeHtml(row.number)}" data-object="averageTimeOnDistance">
        <div class="display-background">${row.averageTimeOnDistance?.display ?? ''}</div>
      </td>

      <td class="runner-cell bold-text ${row.burstPotential?.suitability}" style="${row.burstPotential?.style}" data-number="${escapeHtml(row.number)}" data-object="burstPotential">
        <div class="display-background">${row.burstPotential?.display ?? ''}</div>
      </td>

      <td class="runner-cell bold-text ${row.distanceSuitability?.suitability}" style="${row.distanceSuitability?.style}" data-number="${escapeHtml(row.number)}" data-object="distanceSuitability">
        <div class="display-background">${row.distanceSuitability?.display ?? ''}</div>
      </td>

      <td class="runner-cell bold-text ${row.conditionSuitability?.suitability}" style="${row.conditionSuitability?.style}" data-number="${escapeHtml(row.number)}" data-object="conditionSuitability">
        <div class="display-background">${row.conditionSuitability?.display ?? ''}</div>
      </td>

      <td class="runner-cell bold-text ${row.currentForm?.suitability}" style="${row.currentForm?.style}" data-number="${escapeHtml(row.number)}" data-object="currentForm">
        <div class="display-background">${row.currentForm?.display ?? ''}</div>
      </td>

      <td class="runner-cell bold-text ${row.styleSuitability?.suitability}" style="${row.styleSuitability?.style}" data-number="${escapeHtml(row.number)}" data-object="styleSuitability">
        <div class="display-background">${row.styleSuitability?.display ?? ''}</div>
      </td>

      <td class="runner-cell" data-number="${escapeHtml(row.number)}" data-object="returnToComfort">
        ${row.returnToComfort?.score?.toFixed(2) ?? ''}
      </td>

      <td class="runner-cell" data-number="${escapeHtml(row.number)}" data-object="returnFromBreak">
        ${row.returnFromBreak?.score?.toFixed(2) ?? ''}
      </td>
      <td>${escapeHtml(row.runs[0]?.date)}</td>
      <td>${escapeHtml(row.runs[0]?.adjTimeDistAndCondOnly?.toFixed(2))}</td>
      <td>${escapeHtml(row.runs[0]?.marginValue)}</td>
      <td>${escapeHtml(row.runs[0]?.place)}</td>
      <td>${escapeHtml(row.best?.date)}</td>
      <td>${escapeHtml(row.best?.time?.toFixed(2))}</td>
      <td>${escapeHtml(row.best?.marginValue)}</td>
      <td>${escapeHtml(row.best?.place)}</td>
      <td>${escapeHtml(row.best?.distance)}</td>
      <td>${escapeHtml(row.best?.condition)}</td>
      <td>${escapeHtml(row.weight)}</td>
      <td>${escapeHtml(row.career)}</td>
      <td>${escapeHtml(row.success?.win)}</td>
      <td>${escapeHtml(row.success?.place)}</td>
    `;

    ptbody.appendChild(tr);

    // Get all elements with data-number="5" and set their text color to red
    const cells = document.querySelectorAll('.runnerName[data-number="' + row.number + '"]');
    cells.forEach(cell => {
      cell.style = row.suitabilityStyle;
    });
  });
}

function addRunnerOnClick(results) {
  // Add click handlers to runner cells
  document.querySelectorAll(".runner-cell").forEach(cell => {
    cell.style.cursor = "pointer";
    cell.addEventListener("click", () => {
      const number = cell.dataset.number;
      const object = cell.dataset.object;
      let matched = results.find(r => r.number === number);

      if (object) matched = matched[object];

      const dialog = document.getElementById("run-history-dialog");
      const dialogTitle = document.getElementById("dialog-title");
      const runTableBody = document.querySelector("#run-history-table tbody");

      // 🔍 Get runner name from sibling if needed
      let runnerName = '';
      if (cell.classList.contains('runnerName')) {
        runnerName = cell.textContent.trim();
      } else {
        const row = cell.closest("tr");
        const nameCell = row?.querySelector(".runnerName");
        if (nameCell) {
          runnerName = nameCell.textContent.trim();
        }
      }

      dialogTitle.textContent = `Run History: ${runnerName}`;
      runTableBody.innerHTML = "";

      if (!matched || !matched.runs || matched.runs.length === 0) {
        const noRunsRow = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.textContent = "No runs found.";
        td.style.textAlign = "center";
        td.style.fontStyle = "italic";
        noRunsRow.appendChild(td);
        runTableBody.appendChild(noRunsRow);
        dialog.showModal();
        return;
      }

      matched.runs.forEach(run => {
        const runRow = document.createElement("tr");
        runRow.innerHTML = `
          <td>${escapeHtml(run.date)}</td>
          <td>${escapeHtml(run.time?.toFixed(2))}</td>
          <td>${run.isRelevantDistance ? escapeHtml(run.adjTimeWithWeight?.toFixed(2)) : ''}</td>
          <td>${run.competitiveScore ? escapeHtml(run.competitiveScore) : ''}</td>
          <td>${escapeHtml(run.distance)}</td>
          <td>${escapeHtml(run.condition)}</td>
          <td class="${run.weightClass}">${escapeHtml(run.weight ? run.weight : '') + (run.weightToday ? ' ('+ run.weightToday +')' : '')}</td>
          <td>${escapeHtml(run.marginValue)}</td>
          <td>${escapeHtml(run.place)}</td>
        `;
        runTableBody.appendChild(runRow);
      });

      dialog.showModal();
    });
  });
}

function setupTableSorting() {
  const tables = ["results-table", "top-runs-table", "run-history-table"];

  tables.forEach((tableId) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const headers = table.querySelectorAll("th");
    const tbody = table.querySelector("tbody");

    const sortState = {};

    headers.forEach((header, index) => {
      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        const ascending = !sortState[index]; // toggle
        sortTableByColumn(tbody, index, ascending);
        sortState[index] = ascending;
      });
    });
  });

  function sortTableByColumn(tbody, columnIndex, ascending = true) {
    const dirModifier = ascending ? 1 : -1;
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const sortedRows = rows.sort((a, b) => {
      const aText = a.children[columnIndex].textContent.trim();
      const bText = b.children[columnIndex].textContent.trim();

      const aVal = parseFloat(aText.replace(/[^0-9.\-]/g, "")) || aText.toLowerCase();
      const bVal = parseFloat(bText.replace(/[^0-9.\-]/g, "")) || bText.toLowerCase();

      if (aVal < bVal) return -1 * dirModifier;
      if (aVal > bVal) return 1 * dirModifier;
      return 0;
    });

    tbody.innerHTML = "";
    tbody.append(...sortedRows);
  }
} 

function setupDialogClose() {
  const closeBtn = document.getElementById("close-dialog");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("run-history-dialog").close();
    });
  }

  const dialog = document.getElementById("run-history-dialog");
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const clickedInDialog = (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
    if (!clickedInDialog) dialog.close();
  });
}

function clearTable(tableId) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    if (tbody) {
        tbody.innerHTML = ''; // Clears all rows inside <tbody>
    }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function matchTableWidths() {
    const resultsTable = document.getElementById('results-table');
    const topPicksTable = document.getElementById('top-picks-table');

    if (resultsTable && topPicksTable) {
        // Get the computed width of the results-table
        const resultsWidth = resultsTable.offsetWidth + 'px';

        // Set the width of top-picks-table to match
        topPicksTable.style.width = resultsWidth;
    }
}
