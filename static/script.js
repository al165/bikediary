import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let map = L.map('map').setView([50.0469811, 19.9223924], 5);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

function updatePoints(data) {
    // TODO: incremental updates
    latlongs = [[]];
    currLine = 0;
    for (const msg of data) {
    	// should only apply to ULIMITED-TRACK messages
        const latlong = [msg['latitude'], msg['longitude']];
        if (msg['unixTime'] < lastUnixTime - 24 * 60 * 60) {
            // split line
            if (lastLatLong) {
                jumps.push([
                    latlong,
                    lastLatLong
                ]);
            }
            latlongs.push([]);
            currLine++;
        }
        msg.lat = msg.latitude;
        msg.lng = msg.longitude;
        latlongs[currLine].unshift(msg);
        lastUnixTime = msg['unixTime'];
        lastLatLong = latlong.slice();
        if (msg['messageType'] != "UNLIMITED-TRACK") {
            messageData.push(JSON.parse(JSON.stringify(msg)))
        }
    }
    lastMessage = latlongs.at(-1).at(-1);
    console.log(lastMessage);
}

let latlongs = [[]];
let jumps = [];
let currLine = 0;
let lastUnixTime = 0;
let lastLatLong;
let messageData = [];
let polyline;
let currentMarker;
let plannedRoute;
let plannedPoints = [];
let lastMessage;
let loaded = false;
let closestGPXPoint;

async function getPoints() {
    console.log("getpoints");
    const res = await fetch("/all_messages");
    const data = await res.json();
    updatePoints(data);
    drawOverlay();
}

function getClosestGPXPoint() {
    closestGPXPoint = null;
    if (!plannedRoute || !lastMessage)
        return;


}

setInterval(getPoints, 1000 * 60 * 2);

function drawOverlay() {
    if (polyline) {
        polyline.remove(map);
    }
    polyline = L.polyline(latlongs,
        {
            color: 'blue',
            weight: 2,
            smoothFactor: 3,
        }).arrowheads({
            frequency: '50px',
            size: '12px'
        }).addTo(map);

    if (lastMessage) {
        if (currentMarker)
            currentMarker.remove(map);

        currentMarker = L.marker(lastMessage, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'marker',
                borderWidth: 4,
                borderColor: "blue",
                icon: null,
                text: "",
                textColor: "blue",
            })
        }).addTo(map);
        const updateTime = new Date(lastMessage.unixTime * 1000);
        currentMarker.bindPopup(`
        <b>Current position</b><br>
        <a href="https://maps.google.com/?q=${lastMessage.lat},${lastMessage.lng}" target="_blank" rel="noopener noreferrer">view on Google Maps</a>
        <p>Last message time: ${updateTime.toString()}</p>
        <p>Tracker battery status: ${lastMessage.batteryState.toLowerCase()}</p>
        `);
        if (!loaded) {
            map.setView(currentMarker.getLatLng(), 11);
            loaded = true;
        }
    }
    const geodesic = new L.Geodesic(jumps, { color: 'blue', opacity: 0.5, dashArray: '8', weight: 2 }).arrowheads({ size: '12px', dashArray: '0' }).addTo(map);
    for (const msg of messageData) {
        const latlong = L.latLng(msg['latitude'], msg['longitude']);
        const marker = L.marker(latlong, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'circle-dot',
                borderWidth: 4
            })
        }).addTo(messageMarkerLayer);
        marker.bindPopup(`<b>${msg['messageType']}</b><p>${msg['messageContent']}</p>`);
        marker.bindTooltip(`Message: ${msg['messageType']}`);
    }
    messageMarkerLayer.addTo(map);
}

let messageMarkerLayer = L.layerGroup();
let layerControls = L.control.layers(null, { 'Messages': messageMarkerLayer }).addTo(map);
let plannedDistance = 0;
let elevationChart;

plannedRoute = new L.GPX('planned.gpx', {
    async: true,
    polyline_options: {
        color: 'red',
        weight: 2,
        distanceMarkers: {
            showAll: 13, iconSize: [22, 16]
        }
    }
}).on('addpoint', function (ev) {

      console.log('Added ' + ev.point_type + ' point: ' + ev.point);
    if (ev.point_type === "start") {
        ev.point.bindPopup(`<b>Planned Route: ${ev.target.get_name()}</b><br>Distance: ${Math.round(ev.target.get_distance() / 100) / 10 + 'km'}<br>Expected moving time: ${ev.target.get_duration_string(ev.target.get_total_time(), true)}<br>Elevation gain: ${Math.round(ev.target.get_elevation_gain()) + 'm'}`)
        ev.point.setIcon(new L.BeautifyIcon.icon({
            icon: 'play',
            iconShape: 'circle',
            borderColor: 'red',
            textColor: 'red'
        }))
        ev.point.bindTooltip('Planned route start');
    } else if (ev.point_type === "end") {
        ev.point.setIcon(new L.BeautifyIcon.icon({
            icon: 'flag',
            iconShape: 'circle',
            borderColor: 'red',
            textColor: 'red'
        }));
        ev.point.bindTooltip('Planned route end');
    }
}).on('loaded', function (ev) {
    console.log(plannedRoute);
    console.log(ev.target.get_name());
    console.log(Math.round(ev.target.get_distance() / 100) / 10 + 'km');
    console.log(ev.target.get_duration_string(ev.target.get_total_time(), true));
    console.log(ev.target.get_elevation_gain() + 'm');
    const elevationDataAll = ev.target.get_elevation_data();
    let elevationData = [];
    for(let i = 0; i < elevationDataAll.length; i+=15){
        elevationData.push(elevationDataAll[i]);
    }
    //elevationChart = new Chart(
    //    document.getElementById("elevation-chart"),
    //    {
    //        type: "line",
    //        options: {
    //            animation: false,
    //            plugins: {
    //                legend: {display: false},
    //                tooltip: {enabled: false}
    //            }
    //        },
    //        data: {
    //            labels: elevationData.map(row => Math.floor(row[0])),
    //            datasets: [
    //                {
    //                    label: "elevation (m)",
    //                    data: elevationData.map(row => row[1]),
    //                    borderWidth: 1,
    //                    borderColor: 'red',
    //                    pointRadius: 0
    //                }
    //            ]
    //        }
    //    }
    //);

    makeElevationChart(elevationDataAll);
}).addTo(map);
layerControls.addOverlay(plannedRoute, "Planned Route");

const elevationSlude = L.control.slideMenu("elevation data here soon!", {
  position: "topleft",
  menuPosition: "bottomleft",
  width: "100%",
  height: "30%",
  direction: "vertical",
  icon: "fa fa-line-chart"
}).addTo(map);
elevationSlude.setContents(`<div id="elevationContainer"></div>`);

getPoints();

function makeElevationChart(data) {
    console.log("makeElevationChart");

    const elevationContainer = document.getElementById("elevationContainer");

    const width = parseInt(d3.select("#elevationContainer").style("width"),10);
    const height = 160;// parseInt(d3.select("#elevationContainer").style("height"),10)

    const marginTop = 20;
    const marginRight = 20;
    const marginBottom = 30;
    const marginLeft = 40;

    // Declare the x (horizontal position) scale.
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[0])])
        .range([marginLeft, width - marginRight])
        .nice();
    
    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[1])])
        .range([height - marginBottom, marginTop]);

    // Create the horizontal axis generator, called at startup and when zooming.
    const xAxis = (g, x) => g
        .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))

    // Declare the area generator.
    const area = (data, x) => d3.area()
          .curve(d3.curveStepAfter)
          .x(d => x(d[0]))
          .y0(y(0))
          .y1(d => y(d[1]))
        (data);

    // Create the zoom behavior.
      const zoom = d3.zoom()
          .scaleExtent([1, 32])
          .extent([[marginLeft, 0], [width - marginRight, height]])
          .translateExtent([[marginLeft, -Infinity], [width - marginRight, Infinity]])
          .on("zoom", zoomed);
    
    // Create the SVG container.
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height);

    // Create a clip-path with a unique ID.
      //const clip = DOM.uid("clip");

      svg.append("clipPath")
          .attr("id", "clip-path-0")
        .append("rect")
          .attr("x", marginLeft)
          .attr("y", marginTop)
          .attr("width", width - marginLeft - marginRight)
          .attr("height", height - marginTop - marginBottom);

    const path = svg.append("path")
      .attr("clip-path", "clip-path-0")
      .attr("fill", "#ff0000aa")
      .attr("d", area(data, x));

    // Add the x-axis.
    const gx = svg.append("g")
        .attr("transform", `translate(0,${height - marginBottom})`)
        .call(xAxis, x);
    
    // Add the y-axis.
    svg.append("g")
        .attr("transform", `translate(${marginLeft},0)`)
        .call(d3.axisLeft(y).ticks(5));

    function zoomed(event) {
        const xz = event.transform.rescaleX(x);
        path.attr("d", area(data, xz));
        gx.call(xAxis, xz);
      }
    
    // Append the SVG element.
    elevationContainer.append(svg.node());

    svg.call(zoom)
        //.transition()
      //.duration(750)
      //.call(zoom.scaleTo, 4, [100, 0]);
}
