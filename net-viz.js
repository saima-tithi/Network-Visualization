var width = 960,
	height = 500,
	radius = 6,
	padding = 5,
	border = 1,
	bordercolor = 'black';

var forceGraph = d3.select("#force-layout-graph").append("svg")
.attr("width", width)
.attr("height", height)
.attr("border",border);

var borderPath = forceGraph.append("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("height", height)
			.attr("width", width)
			.style("stroke", bordercolor)
			.style("fill", "none")
			.style("stroke-width", border);

var colorArr = d3.schemeCategory20;

d3.json("miserables.json", function(error, graph) {
	if (error) throw error;
	var links = forceGraph.append("g")
		.attr("class", "links")
		.selectAll("line")
		.data(graph.links)
		.enter()
		.append("line")
		.attr("stroke-width", function(d) {
			return Math.sqrt(d.value);
		})
		.attr("x1", 0)
		.attr("y1", 0)
		.attr("x2", width)
		.attr("y2", height);
	
	var nodes = forceGraph.append("g")
		.attr("class", "nodes")
		.selectAll("circle")
		.data(graph.nodes)
		.enter()
		.append("circle")
		.attr("fill", function(d) {
			return colorArr[d.group];
		})
		.attr("r", radius)
		.attr("cx", function(d) {
			return Math.random() * width;
			})
		.attr("cy", function(d) {
			return Math.random() * height;
			})
		.call(d3.drag()
				.on("start", started)
				.on("drag", dragged)
				.on("end", ended));
				
	nodes.append("title")
      		.text(function(d) { return d.id; });
	
	simulation
		.nodes(graph.nodes)
		.on("tick", ticked);

	simulation.force("link")
		.links(graph.links);
		
	function ticked(d) {
	nodes
		.attr("cx", function(d) {
			return d.x;
		})
		.attr("cy", function(d) {
			return d.y;
		})
	
	links 
		.attr("x1", function (d) {
			return d.source.x;
		})
		.attr("y1", function (d) {
			return d.source.y;
		})
		.attr("x2", function (d) {
			return d.target.x;
		})
		.attr("y2", function (d) {
			return d.target.y;
		})
	}
		
});

function started(d) {
	simulation.alphaTarget(0.3).restart();
}

function dragged(d) {
	d.fx = d3.event.x;
	d.fy = d3.event.y;
}

function ended(d) {
	simulation.alphaTarget(0);
	d.fx = null;
	d.fy = null;		
}

var simulation = d3.forceSimulation()
				.force("link", d3.forceLink().id(function (d) {
					return d.id;
				}))
				.force("repulse", d3.forceManyBody().strength(-30))
				.force("center", d3.forceCenter(width/2, height/2));

