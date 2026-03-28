load:
	k6 run --summary-trend-stats="min,avg,max,p(95),p(99)" loadtest.js | tee loadtest.log