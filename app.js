import * as d3 from "d3";
import { createFilterBar } from "./components/filterBar.js";
import { initLineChart, drawLineChart } from "./charts/lineChart.js";
import { initStackedAreaChart, drawStackedAreaChart } from "./charts/stackedArea.js";


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

// Load CSV
d3.csv("./data/customer_shopping_data.csv").then(data => {

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

    // Initialize filter bar
    createFilterBar(rawData, onFilterChange);

    // Initialize line chart
    initLineChart();

    // Initialize Stacked area
    initStackedAreaChart();

    // First filter pass
    applyFilters();
});

// Filtering
function applyFilters() {
    filteredData = rawData.filter(d => {
        if (filters.dateRange[0] && d.invoice_date < filters.dateRange[0]) return false;
        if (filters.dateRange[1] && d.invoice_date > filters.dateRange[1]) return false;

        if (filters.genders.length > 0 && !filters.genders.includes(d.gender)) return false;
        if (filters.categories.length > 0 && !filters.categories.includes(d.category)) return false;
        if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(d.payment_method)) return false;
        if (filters.malls.length > 0 && !filters.malls.includes(d.shopping_mall)) return false;

        if (filters.ageRange[0] !== null && d.age < filters.ageRange[0]) return false;
        if (filters.ageRange[1] !== null && d.age > filters.ageRange[1]) return false;

        return true;
    });

    console.log("Filtered data:", filteredData);

    // UPDATE LINE CHART
    drawLineChart(filteredData);

    // UPDATE STACKED AREA 
    drawStackedAreaChart(filteredData);

}

// Callback from filter bar
function onFilterChange(newFilters) {
    filters = { ...filters, ...newFilters };
    applyFilters();
}
