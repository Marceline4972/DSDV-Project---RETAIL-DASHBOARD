// charts/lineChart.js
import * as d3 from "d3";

let svg, g, xScale, yScale, xAxisG, yAxisG, linePath;
let width, height, margin;
let xScale0, yScale0, zoom;
let overlay, focusGroup, focusLine, focusDot, tooltip;

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

    g.append("defs")
        .append("clipPath")
        .attr("id", "clip-line")
        .append("rect")
        .attr("width", width)
        .attr("height", height);

    zoom = d3.zoom()
        .scaleExtent([0.5, 20]) // zoom in/out limits
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on("zoom", zoomed);

    svg.call(zoom);

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
        .attr("stroke", "#1f77b4")
        .attr("clip-path", "url(#clip-line)");

    // Focus group (line + dot)
    focusGroup = g.append("g")
        .style("display", "none");

    focusLine = focusGroup.append("line")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#999")
        .attr("stroke-dasharray", "3,3");

    focusDot = focusGroup.append("circle")
        .attr("r", 4)
        .attr("fill", "#1f77b4");

    // Tooltip div (HTML)
    tooltip = d3.select("#line-chart")
        .append("div")
        .style("position", "absolute")
        .style("background", "rgba(0,0,0,0.75)")
        .style("color", "#fff")
        .style("padding", "6px 8px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("display", "none");

    overlay = g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .on("click", handleClick);

    overlay.attr("width", width);
    focusLine.attr("y2", height);

    svg.on("mouseleave", () => {
        focusGroup.style("display", "none");
        tooltip.style("display", "none");
    });

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

        g.select("#clip-line rect").attr("width", width);

        zoom
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]]);

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

function zoomed(event) {
    if (!xScale0) return;

    const zx = event.transform.rescaleX(xScale0);
    xScale.domain(zx.domain());

    xAxisG.call(d3.axisBottom(xScale));
    yAxisG.call(d3.axisLeft(yScale)); // unchanged

    const lineGen = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    linePath.attr("d", lineGen);
}

function handleClick(event) {
    if (!drawLineChart.aggData?.length) return;

    const data = drawLineChart.aggData;

    const [mx] = d3.pointer(event);
    const date = xScale.invert(mx);

    // Nearest point search
    const bisect = d3.bisector(d => d.date).left;
    const i = bisect(data, date);
    const d0 = data[i - 1];
    const d1 = data[i];
    const d = !d0 ? d1
        : !d1 ? d0
            : (date - d0.date > d1.date - date ? d1 : d0);

    if (!d) return;

    const x = xScale(d.date);
    const y = yScale(d.value);

    // Show focus
    focusGroup.style("display", null);
    focusLine.attr("x1", x).attr("x2", x);
    focusDot.attr("cx", x).attr("cy", y);

    // Tooltip
    tooltip
        .style("display", "block")
        .style("left", `${x + margin.left + 10}px`)
        .style("top", `${y + margin.top - 10}px`)
        .html(`
        <strong>${d3.timeFormat("%Y-%m-%d")(d.date)}</strong><br/>
        Sale: ${d3.format(",.2f")(d.value)}
      `);
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
    drawLineChart.aggData = agg;

    if (!agg.length) {
        linePath.datum([]).transition().duration(600).attr("d", null);
        return;
    }

    // update domains
    const xDomain = d3.extent(agg, d => d.date);
    const yMax = d3.max(agg, d => d.value);
    xScale.domain(xDomain);
    yScale.domain([0, yMax === undefined ? 1 : yMax]).nice();
    xScale0 = xScale.copy();
    yScale0 = yScale.copy();

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
