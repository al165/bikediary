import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export class ElevationPlotter {

    constructor(elevationContainer, data) {
        console.log("plotter");
        this.data = data;
        this.position = 0;

        const width = parseInt(d3.select(elevationContainer).style("width"), 10);
        this.width = width;
        const height = 160; // parseInt(d3.select(elevationContainer).style("height"),10)

        const marginTop = 20;
        const marginRight = 20;
        const marginBottom = 30;
        const marginLeft = 40;

        // Declare the x (horizontal position) scale.
        this.x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.meta.distance)])
            .range([marginLeft, width - marginRight])
            .nice();

        // Declare the y (vertical position) scale.
        this.y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.meta.ele)])
            .range([height - marginBottom, marginTop]);

        // Create the horizontal axis generator, called at startup and when zooming.
        this.xAxis = (g, x) => g
            .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

        // Declare the area generator.
        this.area = (data, x) => d3.area()
            .curve(d3.curveStepAfter)
            .x(d => x(d.meta.distance))
            .y0(this.y(0))
            .y1(d => this.y(d.meta.ele))
            (data);

        // Create the zoom behavior.
        this.zoom = d3.zoom()
            .scaleExtent([1, 32])
            .extent([
                [marginLeft, 0],
                [width - marginRight, height]
            ])
            .translateExtent([
                [marginLeft, -Infinity],
                [width - marginRight, Infinity]
            ])
            .on("zoom", (event) => this.zoomed(event));

        // Create the SVG container.
        this.svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height);

        // Create a clip-path with a unique ID.
        this.svg.append("defs").append("clipPath")
            .attr("id", "clip-path-0")
            .append("rect")
            .attr("x", marginLeft)
            .attr("y", marginTop)
            .attr("width", width - marginLeft - marginRight)
            .attr("height", height - marginTop - marginBottom);

        // this.path = this.svg.append("path")
        //     .attr("clip-path", "url(#clip-path-0)")
        //     .attr("fill", "#ff0000aa")
        //     .attr("d", this.area(data, this.x));

        // Add the x-axis.
        this.gx = this.svg.append("g")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(this.xAxis, this.x);

        // Add the y-axis.
        this.svg.append("g")
            .attr("transform", `translate(${marginLeft},0)`)
            .call(d3.axisLeft(this.y).ticks(5));

        this.xz = this.x;
        this.zoomed = (event) => {
            this.xz = event.transform.rescaleX(this.x);
            //this.path.attr("d", this.area(this.data, this.xz));
            this.gx.call(this.xAxis, this.xz);
            this.updatePosition(this.distance);
        };

        // Append the SVG element.
        elevationContainer.append(this.svg.node());

        // // Optional zoom setup
        this.svg.call(this.zoom)

        this.updatePosition(0);
    }

    updatePosition(distance) {
        this.distance = distance;

        const leftData = this.data.filter(d => d.meta.distance < distance);
        const rightData = this.data.filter(d => d.meta.distance >= distance);

        const leftPath = this.svg.selectAll(".line-left")
            .data([leftData]);

        leftPath.enter()
            .append("path")
            .attr("class", "line-left")
            .merge(leftPath)
            .attr("d", this.area(leftData, this.xz))
            .attr("clip-path", "url(#clip-path-0)")
            .attr("fill", "#0000ffaa")
            .attr("stroke", "none")
            .attr("stroke-width", 2);

        leftPath.exit().remove();

        // Bind and update the right segment
        const rightPath = this.svg.selectAll(".line-right")
            .data([rightData]);

        rightPath.enter()
            .append("path")
            .attr("class", "line-right")
            .merge(rightPath)
            .attr("d", this.area(rightData, this.xz))
            .attr("clip-path", "url(#clip-path-0)")
            .attr("fill", "#ff0000aa")
            .attr("stroke", "none")
            .attr("stroke-width", 2);

        rightPath.exit().remove();
    }
}

