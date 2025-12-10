// charts/lineChart.js
import * as d3 from "d3";

let svg, g, xScale, yScale, xAxisG, yAxisG, linePath;
let width, height, margin;

let currentGranularity = "daily"; // default

// Initialize chart (call once)
export function initLineChart() {
    const container = document.getElementById("line-chart");
    if (!container) {
        console.warn("line-chart container not found");
        return;
    }

    // Clear previous
    container.innerHTML = "";

    margin = { top: 40, right: 40, bottom: 50, left: 70 };

    const outerWidth = container.clientWidth || 800;
    width = outerWidth - margin.left - margin.right;
    height = 450 - margin.top - margin.bottom;

    svg = d3.select(container)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // scales
    xScale = d3.scaleTime().range([0, width]);
    yScale = d3.scaleLinear().range([height, 0]);

    // axis groups
    xAxisG = g.append("g").attr("transform", `translate(0, ${height})`);
    yAxisG = g.append("g");

    // path (no dots)
    linePath = g.append("path")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("stroke", "#1f77b4");

    // wire dropdown - redraw on change
    const freq = document.getElementById("freqSelect");
    if (freq) {
        // initialize from select if present
        currentGranularity = freq.value || currentGranularity;
        freq.addEventListener("change", (e) => {
            currentGranularity = e.target.value;
            // redraw with last data (if any)
            if (drawLineChart.lastData) drawLineChart(drawLineChart.lastData);
        });
    }

    // handle resize
    window.addEventListener("resize", () => {
        const c = document.getElementById("line-chart");
        const newOuter = c.clientWidth || 800;
        width = newOuter - margin.left - margin.right;
        svg.attr("width", width + margin.left + margin.right);
        xScale.range([0, width]);
        // re-render axes + line with last data
        if (drawLineChart.lastData) drawLineChart(drawLineChart.lastData);
    });
}

// Helper: aggregate data by granularity
function aggregateData(data, granularity) {
    if (!data || data.length === 0) return [];

    // Group by key
    const groups = d3.rollups(
        data,
        values => d3.sum(values, d => d.quantity * d.price),
        d => {
            const dt = d.invoice_date;
            if (!(dt instanceof Date) || isNaN(dt)) return null;

            if (granularity === "daily") {
                return d3.timeFormat("%Y-%m-%d")(dt);
            }
            if (granularity === "weekly") {
                // use ISO week floor (week start Monday) via d3.timeMonday.floor or d3.timeWeek.floor depending on desired start
                // we'll use d3.timeWeek.floor (Sunday start) for consistency with JS Date weeks
                return d3.timeFormat("%Y-%m-%d")(d3.timeWeek.floor(dt));
            }
            if (granularity === "monthly") {
                return d3.timeFormat("%Y-%m")(dt); // YYYY-MM
            }
            if (granularity === "quarterly") {
                const q = Math.floor(dt.getMonth() / 3) + 1;
                return `${dt.getFullYear()}-Q${q}`; // e.g. 2023-Q2
            }
            return d3.timeFormat("%Y-%m-%d")(dt);
        }
    );

    // Convert grouped results into array of {date, value}
    const parsed = groups
        .map(([key, value]) => {
            let date;
            if (key == null) {
                date = new Date(NaN);
            } else if (key.includes("-Q")) {
                // quarterly: "YYYY-Qn" -> first day of quarter
                const [yr, q] = key.split("-Q");
                const month = (Number(q) - 1) * 3; // 0-based month index
                date = new Date(Number(yr), month, 1);
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                // YYYY-MM-DD
                date = d3.timeParse("%Y-%m-%d")(key);
            } else if (/^\d{4}-\d{2}$/.test(key)) {
                // YYYY-MM
                date = d3.timeParse("%Y-%m")(key);
                // make explicit start of month
                if (date) date = new Date(date.getFullYear(), date.getMonth(), 1);
            } else {
                // fallback parse
                date = new Date(key);
            }
            return { date, value };
        })
        .filter(d => d.date instanceof Date && !isNaN(d.date))
        .sort((a, b) => a.date - b.date);

    return parsed;
}

// draw / update the chart
export function drawLineChart(data) {
    // Save last data for resize/redraw
    drawLineChart.lastData = data;

    if (!svg || !g) {
        console.warn("Chart not initialized - call initLineChart() first.");
        return;
    }

    if (!data || data.length === 0) {
        // clear path and axes
        linePath.datum([]).transition().duration(600).attr("d", null);
        xAxisG.transition().duration(600).call(d3.axisBottom(xScale));
        yAxisG.transition().duration(600).call(d3.axisLeft(yScale));
        return;
    }

    const agg = aggregateData(data, currentGranularity);

    if (!agg.length) {
        linePath.datum([]).transition().duration(600).attr("d", null);
        return;
    }

    // update domains
    const xDomain = d3.extent(agg, d => d.date);
    const yMax = d3.max(agg, d => d.value);
    xScale.domain(xDomain);
    yScale.domain([0, yMax === undefined ? 1 : yMax]).nice();

    // axes transitions
    const xAxis = d3.axisBottom(xScale).ticks(Math.min(10, agg.length));
    const yAxis = d3.axisLeft(yScale).ticks(6);

    xAxisG.transition().duration(700).call(xAxis);
    yAxisG.transition().duration(700).call(yAxis);

    // line generator
    const lineGen = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    // animate path
    linePath
        .datum(agg)
        .transition()
        .duration(900)
        .ease(d3.easeCubic)
        .attr("d", lineGen);
}
