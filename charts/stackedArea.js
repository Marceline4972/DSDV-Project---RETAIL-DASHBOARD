// charts/stackedArea.js
import * as d3 from "d3";

/* =========================
   Global variables
========================= */
let svg, g, xScale, yScale, xAxisG, yAxisG;
let width, height, margin;

// MUST match HTML radio values
let currentMode = "contribution"; // "contribution" | "income"

/* =========================
   Helper functions
========================= */

// Age → Age Cluster
function getAgeCluster(age) {
    if (age <= 25) return "18-25";
    if (age <= 35) return "26-35";
    if (age <= 45) return "36-45";
    if (age <= 55) return "46-55";
    if (age <= 65) return "56-65";
    return "65+";
}

// Spending segment
function getSegment(d) {
    const spend = d.quantity * d.price;
    if (spend > 300) return "High";
    if (spend > 100) return "Medium";
    return "Low";
}

/* =========================
   INIT CHART
========================= */
export function initStackedAreaChart() {

    // ✅ FIX: correct container ID
    const container = document.getElementById("areachart-container");
    if (!container) {
        console.warn("areachart-container not found");
        return;
    }

    container.innerHTML = "";

    margin = { top: 40, right: 30, bottom: 50, left: 70 };
    width = container.clientWidth - margin.left - margin.right;
    height = 420 - margin.top - margin.bottom;

    svg = d3.select(container)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // X = age groups
    xScale = d3.scaleBand()
        .domain(["18-25", "26-35", "36-45", "46-55", "56-65", "65+"])
        .range([0, width])
        .padding(0.15);

    yScale = d3.scaleLinear()
        .range([height, 0]);

    xAxisG = g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    yAxisG = g.append("g");

    /* =========================
       MODE SWITCH (RADIO)
    ========================= */
    d3.selectAll("input[name='areaMode']")
        .on("change", e => {
            currentMode = e.target.value;
            if (drawStackedAreaChart.lastData) {
                drawStackedAreaChart(drawStackedAreaChart.lastData);
            }
        });

    /* =========================
       CATEGORY MULTI SELECT
    ========================= */
    const categorySelect = document.getElementById("areaCategorySelect");
    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            if (drawStackedAreaChart.lastData) {
                drawStackedAreaChart(drawStackedAreaChart.lastData);
            }
        });
    }
}

/* =========================
   DRAW / UPDATE
========================= */
export function drawStackedAreaChart(data) {

    drawStackedAreaChart.lastData = data;

    if (!svg || !g || !data || data.length === 0) {
        return;
    }

    /* =========================
       CATEGORY FILTER
    ========================= */
    const categorySelect = document.getElementById("areaCategorySelect");
    let selectedCategories = [];

    if (categorySelect) {
        selectedCategories = Array.from(categorySelect.selectedOptions)
            .map(d => d.value);
    }

    let filtered = data;
    if (selectedCategories.length > 0) {
        filtered = data.filter(d =>
            selectedCategories.includes(d.category)
        );
    }

    /* =========================
       AGGREGATION
    ========================= */
    const ageBins = xScale.domain();

    const valueAccessor = d =>
        currentMode === "income"
            ? d.quantity * d.price   // Total Income
            : 1;                     // Client Contribution (count)

    const aggregated = ageBins.map(ageBin => {
        const items = filtered.filter(
            d => getAgeCluster(d.age) === ageBin
        );

        return {
            age: ageBin,
            High: d3.sum(items.filter(d => getSegment(d) === "High"), valueAccessor),
            Medium: d3.sum(items.filter(d => getSegment(d) === "Medium"), valueAccessor),
            Low: d3.sum(items.filter(d => getSegment(d) === "Low"), valueAccessor)
        };
    });

    const keys = ["High", "Medium", "Low"];

    const stack = d3.stack().keys(keys);
    const series = stack(aggregated);

    yScale.domain([
        0,
        d3.max(aggregated, d => d.High + d.Medium + d.Low) || 1
    ]).nice();

    yAxisG.transition()
        .duration(600)
        .call(d3.axisLeft(yScale));

    /* =========================
       AREA GENERATOR
    ========================= */
    const area = d3.area()
        .x(d => xScale(d.data.age) + xScale.bandwidth() / 2)
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    /* =========================
       DRAW STACKED LAYERS
    ========================= */
    const colorMap = {
        High: "#1f77b4",
        Medium: "#ff7f0e",
        Low: "#2ca02c"
    };

    const layers = g.selectAll(".layer")
        .data(series, d => d.key);

    layers.enter()
        .append("path")
        .attr("class", "layer")
        .attr("fill", d => colorMap[d.key])
        .attr("opacity", 0.85)
        .attr("d", area)
        .merge(layers)
        .transition()
        .duration(800)
        .attr("d", area);

    layers.exit().remove();
}
