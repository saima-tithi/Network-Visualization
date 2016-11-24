var width = 960,     // svg width
	height = 500,     // svg height
	radius = 4,      // default node radius
	offset = 15,    // cluster hull offset
	padding = 5,
	border = 1,
	bordercolor = 'black',
	expand = {}, // expanded clusters
	n = 100,	// number of times force runs, then it stops to get static layout
	data, net, force, hullg, hull, linkg, link, nodeg, node;

var curve = d3.svg.line()
	.interpolate("cardinal-closed")
	.tension(.85);

var fill = d3.scale.category20();

function noop() { return false; }

function nodeid(n) {
	return n.size ? "Group_" + n.group : n.name;
}

function linkid(l) {
	var u = nodeid(l.source),
	v = nodeid(l.target);
	return u<v ? u+"|"+v : v+"|"+u;
}

function getGroup(n) { 
	/* if (n.group == "DSE")
		return 1;
	else if (n.group == "SRH")
		return 2;
	else if (n.group == "DMCT")
		return 3;
	else if (n.group == "SFLE")
		return 4;
	else if (n.group == "DISQ")
		return 5; */
	return n.group;
}

// constructs the network to visualize
function network(data, prev, expand) {
	expand = expand || {};
	var gm = {},    // group map
	nm = {},    // node map
	lm = {},    // link map
	gn = {},    // previous group nodes
	gc = {},    // previous group centroids
	nodes = [], // output nodes
	links = []; // output links

	// process previous nodes for reuse or centroid calculation
	if (prev) {
		prev.nodes.forEach(function(n) {
			var i = getGroup(n), o;
			if (n.size > 0) {
				gn[i] = n;
				n.size = 0;
			} else {
				o = gc[i] || (gc[i] = {x:0,y:0,count:0});
				o.x += n.x;
				o.y += n.y;
				o.count += 1;
			}
		});
	}

	// determine nodes
	for (var k=0; k<data.nodes.length; ++k) {
		var n = data.nodes[k];
		var i = getGroup(n),
		l = gm[i] || (gm[i]=gn[i]) || (gm[i]={group:i, size:0, nodes:[]});

		if (expand[i]) {
			// the node should be directly visible
			nm[n.name] = nodes.length;
			nodes.push(n);
		if (gn[i]) {
			// place new nodes at cluster location (plus jitter)
			n.x = gn[i].x + Math.random();
			n.y = gn[i].y + Math.random();
		}
		} else {
			// the node is part of a collapsed cluster
			if (l.size == 0) {
				// if new cluster, add to set and position at centroid of leaf nodes
				nm[i] = nodes.length;
				nodes.push(l);
				if (gc[i]) {
					l.x = gc[i].x / gc[i].count;
					l.y = gc[i].y / gc[i].count;
				}
			}
			l.nodes.push(n);
		}
		// always count group size as we also use it to tweak the force graph strengths/distances
		l.size += 1;
		n.group_data = l;
	}

	for (i in gm) { gm[i].link_count = 0; }

	// determine links
	for (k=0; k<data.links.length; ++k) {
		var e = data.links[k];
		var u = getGroup(e.source);
		var v = getGroup(e.target);
		if (u != v) {
			gm[u].link_count++;
			gm[v].link_count++;
		}
		u = expand[u] ? nm[e.source.name] : nm[u];
		v = expand[v] ? nm[e.target.name] : nm[v];
		var i = (u<v ? u+"|"+v : v+"|"+u),
		l = lm[i] || (lm[i] = {source:u, target:v, size:0});
		l.size += 1;
	}
	
	for (i in lm) { links.push(lm[i]); }

	return {nodes: nodes, links: links};
}

function convexHulls(nodes, offset) {
	var hulls = {};

	// create point sets
	for (var k=0; k<nodes.length; ++k) {
		var n = nodes[k];
		if (n.size) 
			continue;
		
		var i = getGroup(n);
		
		var l = hulls[i] || (hulls[i] = []);
		l.push([n.x-offset, n.y-offset]);
		l.push([n.x-offset, n.y+offset]);
		l.push([n.x+offset, n.y-offset]);
		l.push([n.x+offset, n.y+offset]);
	}

	// create convex hulls
	var hullset = [];
	for (i in hulls) {
		hullset.push({group: i, path: d3.geom.hull(hulls[i])});
	}

	return hullset;
}

function drawCluster(d) {
	return curve(d.path); // 0.8
}

// --------------------------------------------------------

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

//function loadData() {
	//var e = document.getElementById('dataset');
	//var dataset = e.options[e.selectedIndex].value;
	//var dataFile = 'data/' + dataset + '.json';
	//console.log("in loadData", dataFile);
	d3.json('data/workplace_small.json', function(error, json) {
		if (error) throw error;
		data = json;
		for (var i=0; i<data.links.length; ++i) {
			o = data.links[i];
			var sourceNode, targetNode;
			for (var k = 0; k < data.nodes.length; ++k) {
				var node = data.nodes[k];
				if (o.source === node.name) {
					sourceNode = node;
					continue;
				}
				if (o.target === node.name) {
					targetNode = node;
					continue;
				}
			}
			o.source = sourceNode;
			o.target = targetNode;
		}

		hullg = forceGraph.append("g");
		linkg = forceGraph.append("g");
		nodeg = forceGraph.append("g");

		init();

		forceGraph.attr("opacity", 1e-6)
			.transition()
			.duration(1000)
			.attr("opacity", 1);
	});
//}

function init() {
	if (force) force.stop();

	net = network(data, net, expand);

	force = d3.layout.force()
		.nodes(net.nodes)
		.links(net.links)
		.size([width, height])
		.linkDistance(function(l, i) {
			var n1 = l.source, n2 = l.target;
			// larger distance for bigger groups:
			// both between single nodes and _other_ groups (where size of own node group still counts),
			// and between two group nodes.
			//
			// reduce distance for groups with very few outer links,
			// again both in expanded and grouped form, i.e. between individual nodes of a group and
			// nodes of another group or other group node or between two group nodes.
			//
			// The latter was done to keep the single-link groups ('blue', rose, ...) close.
			return 30 +
				Math.min(20 * Math.min((n1.size || (n1.group != n2.group ? n1.group_data.size : 0)),
					(n2.size || (n1.group != n2.group ? n2.group_data.size : 0))),
					-30 +
					30 * Math.min((n1.link_count || (n1.group != n2.group ? n1.group_data.link_count : 0)),
					(n2.link_count || (n1.group != n2.group ? n2.group_data.link_count : 0))),
					100);
			//return 150;
		})
		.linkStrength(function(l, i) {
			return 1;
		})
		.gravity(0.4)   // gravity+charge tweaked to ensure good 'grouped' view (e.g. green group not smack between blue&orange, ...
		.charge(-600)    // ... charge is important to turn single-linked groups to the outside
		.friction(0.8)   // friction adjusted to get dampened display: less bouncy bouncy ball [Swedish Chef, anyone?]
		.on("tick", ticked)
		.start();

	hullg.selectAll("path.hull").remove();
	hull = hullg.selectAll("path.hull")
		.data(convexHulls(net.nodes, offset))
		.enter().append("path")
		.attr("class", "hull")
		.attr("d", drawCluster)
		.style("fill", function(d) { return fill(d.group); })
		.on("click", function(d) {
			console.log("hull click", d, arguments, this, expand[d.group]);
			expand[d.group] = false; 
			init();
		});

	node = nodeg.selectAll("circle.node").data(net.nodes, nodeid);
	node.exit().remove();
	node.enter().append("circle")
		// if (d.size) -- d.size > 0 when d is a group node.
		.attr("class", function(d) { return "node" + (d.size?"":" leaf"); })
		.attr("r", function(d) { return d.size ? d.size + radius : radius+1; })
		.attr("cx", function(d) { return d.x; })
		.attr("cy", function(d) { return d.y; })
		.style("fill", function(d) { return fill(d.group); })
		.style("stroke", function(d) { return d3.rgb(fill(d.group)).darker(); })
		.on("click", function(d) {
			console.log("node click", d, arguments, this, expand[d.group]);
			expand[d.group] = !expand[d.group];
			init();
		});
		
	link = linkg.selectAll("line.link").data(net.links, linkid);
	link.exit().remove();
	link.enter().append("line")
		.attr("class", "link")
		.attr("x1", function(d) { return d.source.x; })
		.attr("y1", function(d) { return d.source.y; })
		.attr("x2", function(d) { return d.target.x; })
		.attr("y2", function(d) { return d.target.y; })
		.style("stroke-width", function(d) { return d.size * 0.25 || 1; });
		//.style("stroke-width", function(d) { return 1; });

	node.append("title")
		.text(function(d) { return nodeid(d) });
	
	node.call(force.drag);

	function ticked(d) {
		if (!hull.empty()) {
			hull.data(convexHulls(net.nodes, offset))
				.attr("d", drawCluster);
		}

		link.attr("x1", function(d) { return d.source.x; })
			.attr("y1", function(d) { return d.source.y; })
			.attr("x2", function(d) { return d.target.x; })
			.attr("y2", function(d) { return d.target.y; });
		//console.log("in tick", link);
		node.attr("cx", function(d) { return d.x = Math.max(radius, Math.min(width - radius, d.x)); })
			.attr("cy", function(d) { return d.y = Math.max(radius, Math.min(height - radius, d.y)); });
	}
	
	//code for static graph, not working
	/* force.start();
	for (var i = 0; i < n*n; ++i) force.tick();
	force.stop();  */
}

// -------------------------------------------------------------------------------------
//slider code
var margin = {
    top: 25,
    right: 30,
    bottom: 25,
    left: 30
};
var widthSlidr = 900;
var heightSlidr = 50;
formatDate = d3.time.format("%b %d");
// initial value
var startValue = new Date('2012-01-02');
var endValue = new Date('2013-01-01');
// scale function
var timeScale = d3.time.scale()
	.domain([startValue, endValue])
	.range([0, widthSlidr])
	.clamp(true);

// defines brush
var brush = d3.svg.brush()
	.x(timeScale)
	.extent([startValue, startValue])
	.on("brush", slideEvent);

var sliderContainer = d3.select("#slider").append("svg")
	.attr("width", widthSlidr + margin.left + margin.right)
	.attr("height", heightSlidr + margin.top + margin.bottom)
	.append("g")
	// classic transform to position g
	.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

sliderContainer.append("g")
	.attr("class", "x axis")
	// put in middle of screen
	.attr("transform", "translate(0," + heightSlidr / 2 + ")")
	// inroduce axis
	.call(d3.svg.axis()
	.scale(timeScale)
	.orient("bottom")
	.tickFormat(function(d) {
		return formatDate(d);
	})
	.tickSize(0)
	.tickPadding(12)
	.tickValues([timeScale.domain()[0], timeScale.domain()[1]]))
	.select(".domain")
	.select(function() {
		console.log(this);
		return this.parentNode.appendChild(this.cloneNode(true));
	})
	.attr("class", "halo");

var slider = sliderContainer.append("g")
	.attr("class", "slider")
	.call(brush);

slider.selectAll(".extent,.resize")
	.remove();

slider.select(".background")
	.attr("height", height);

var handle = slider.append("g")
	.attr("class", "handle")

handle.append("path")
	.attr("transform", "translate(0," + heightSlidr / 2 + ")")
	.attr("d", "M 0 -20 V 20")

handle.append('text')
	.text(startValue)
	.attr("transform", "translate(" + (-18) + " ," + (heightSlidr / 2 - 25) + ")");

slider
	.call(brush.event)

function slideEvent() {
	var value = brush.extent()[0];

	if (d3.event.sourceEvent) { // not a programmatic event
		value = timeScale.invert(d3.mouse(this)[0]);
		brush.extent([value, value]);
	}

	handle.attr("transform", "translate(" + timeScale(value) + ",0)");
	handle.select('text').text(formatDate(value));
}

// ---------------------
//code for selecting data set from dropdown menu
//loadData();