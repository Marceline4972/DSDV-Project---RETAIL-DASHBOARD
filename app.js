import * as d3 from "d3";
import { createFilterBar } from "./components/filterBar.js";
import { initLineChart, drawLineChart } from "./charts/lineChart.js";
import { initStackedAreaChart, drawStackedAreaChart } from "./charts/stackedArea.js";
import { initSankeyDiagram, drawSankeyDiagram } from "./charts/sankeyDiagram.js";

let rawData = [];
let filteredData = [];

let filters = {
    dateRange: [null, null],
    genders: [],
    categories: [],
    paymentMethods: [],
    malls: [],
    ageRange: [null, null]
};

// add KPI
const currencyFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
});
const numberFormat = new Intl.NumberFormat('en-US');

function updateKPIs(data) {
    if (!data || data.length === 0) {
        document.getElementById("kpi-revenue").textContent = "$0";
        document.getElementById("kpi-orders").textContent = "0";
        document.getElementById("kpi-customers").textContent = "0";
        document.getElementById("kpi-avg").textContent = "$0";
        return;
    }

    const totalRevenue = d3.sum(data, d => d.price * d.quantity);
    const uniqueInvoices = new Set(data.map(d => d.invoice_no)).size;
    const uniqueCustomers = new Set(data.map(d => d.customer_id)).size;
    const avgOrderValue = uniqueInvoices > 0 ? totalRevenue / uniqueInvoices : 0;

    document.getElementById("kpi-revenue").textContent = currencyFormat.format(totalRevenue);
    document.getElementById("kpi-orders").textContent = numberFormat.format(uniqueInvoices);
    document.getElementById("kpi-customers").textContent = numberFormat.format(uniqueCustomers);
    document.getElementById("kpi-avg").textContent = currencyFormat.format(avgOrderValue);
}


// LOAD CSV (Vite path)
d3.csv("/data/customer_shopping_data.csv").then(data => {

    rawData = data.map(d => {
        const parts = d.invoice_date.split('/');
        let day, month, year;

        if (parts.length === 3) {
            const p0 = +parts[0];
            const p1 = +parts[1];
            const p2 = +parts[2];

            if (p0 > 12) {
                day = p0;
                month = p1;
            } else if (p1 > 12) {
                day = p1;
                month = p0;
            } else {
                month = p0;
                day = p1;
            }
            year = p2;
        } else {
            const dt = new Date(d.invoice_date);
            day = dt.getDate();
            month = dt.getMonth() + 1;
            year = dt.getFullYear();
        }

        return {
            invoice_no: d.invoice_no,
            customer_id: d.customer_id,
            gender: d.gender,
            age: +d.age,
            category: d.category,
            quantity: +d.quantity,
            price: +d.price,
            payment_method: d.payment_method,
            invoice_date: new Date(year, month - 1, day),
            shopping_mall: d.shopping_mall
        };
    });

    console.log("Loaded data:", rawData);

    // INIT
    createFilterBar(rawData, onFilterChange);

    // Initialize charts
    initLineChart();
    initStackedAreaChart();
    initSankeyDiagram();

    // FIRST RENDER
    applyFilters();
});

// FILTERING
function applyFilters() {
    filteredData = rawData.filter(d => {
        if (filters.dateRange[0] && d.invoice_date < filters.dateRange[0]) return false;
        if (filters.dateRange[1] && d.invoice_date > filters.dateRange[1]) return false;

        if (filters.genders.length && !filters.genders.includes(d.gender)) return false;
        if (filters.categories.length && !filters.categories.includes(d.category)) return false;
        if (filters.paymentMethods.length && !filters.paymentMethods.includes(d.payment_method)) return false;
        if (filters.malls.length && !filters.malls.includes(d.shopping_mall)) return false;

        if (filters.ageRange[0] !== null && d.age < filters.ageRange[0]) return false;
        if (filters.ageRange[1] !== null && d.age > filters.ageRange[1]) return false;

        return true;
    });

    console.log("Filtered data:", filteredData);

    drawLineChart(filteredData);
    drawStackedAreaChart(filteredData);
    drawSankeyDiagram(filteredData);
    updateKPIs(filteredData);
}

// FILTER CALLBACK
function onFilterChange(newFilters) {
    filters = { ...filters, ...newFilters };
    applyFilters();
}

console.log("Filtered data:", filteredData);
