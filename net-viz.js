var width = 960,     // svg width
	height = 500,     // svg height
	radius = 4,      // default node radius
	offset = 15,    // cluster hull offset
	padding = 1,
	border = 1,
	bordercolor = 'black',
	expand = {}, // expanded clusters
	n = 100,	// number of times force runs, then it stops to get static layout
	data, net, force, hullg, hull, linkg, link, nodeg, node;
    time1 = 1, time2 = 10;

var curve = d3.svg.line()
	.interpolate("basis-closed")
	.tension(.85);

var fill = d3.scale.category10();

// constants

function noop() { return false; }

function nodeid(n) {
	return n.size ? "Group_" + n.group : n.name;
}

function linkid(l) {
	var u = nodeid(l.source),
	v = nodeid(l.target);
	return u<v ? u+"|"+v : v+"|"+u;
}

function nodeLegend(n) {
	if (n.size) {
		return "Group: " + n.group + ", Size: " + n.active_node + ", Degree: " + n.link_count;
	}
	return "Node: " + n.name + ", Group: " + n.group_data.group + ", Degree: " + n.node_link_count;
}

function getGroup(n) { 
	return n.group;
}

// constructs the network to visualize
function network(data, prev, expand, time1, time2) {
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
	for (i in gm) { gm[i].active_node = 0; }
    nodes.forEach(function(n) {
		n.node_link_count = 0;
	}); 
	for (i in nodes) {
		for (j in nodes[i].nodes) {
			nodes[i].nodes[j].node_link_count = 0;
		}
	}
	// determine links
	for (k=0; k<data.links.length; ++k) {
		var e = data.links[k];
        if(e.time >= time1 && e.time <= time2){
			e.source.node_link_count++;
			e.target.node_link_count++;
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

function loadData(fileName) {
	//var e = document.getElementById('dataset');
	//var dataset = e.options[e.selectedIndex].value;
	//var dataFile = 'data/' + dataset + '.json';
	//console.log("in loadData", dataFile);
    maxtime = 0
	d3.json(fileName, function(error, json) {
		if (error) throw error;
		data = json;
        
		for (var i=0; i<data.links.length; ++i) {
			if(parseInt(data.links[i].time) >= maxtime) {
				maxtime = data.links[i].time; 
            }else{
				//console.log(data.links[i].time, maxtime)
            }
            
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
        
        //console.log(data.links)
		hullg = forceGraph.append("g");
		linkg = forceGraph.append("g");
		nodeg = forceGraph.append("g");
        
        d3.select('#slider3').call(d3.slider().axis(true).min(1).max(maxtime).value( [ 1, maxtime ] ).on("slide", function(evt, value) {
            d3.select('#slider3textmin').text(value[ 0 ]);
            d3.select('#slider3textmax').text(value[ 1 ]);
            init(value[ 0 ] ,value[ 1 ]);
            //console.log(value[0], value[1])
            
		}));
        d3.select('#slider3textmin').node().innerHTML =  1;
        d3.select('#slider3textmax').node().innerHTML =  maxtime;
     
		init(1, maxtime);
        //console.log(maxtime)
		forceGraph.attr("opacity", 1e-6)
			.transition()
			.duration(1000)
			.attr("opacity", 1);
	});
}

loadData('data/workplace_small.json');

function init(time1, time2) {
    
	if (force) force.stop();
    
	net = network(data, net, expand, parseInt(time1), parseInt(time2));
	for (var i = 0; i < net.nodes.length; i++) {
		var dup = net.nodes[i];
		if(dup.size) {
			//console.log("", dup.size);
			var uniq = dup.nodes.reduce(function(a,b){
				if (a.indexOf(b) < 0 ) a.push(b);
				return a;
			},[]);
			for (k in uniq) {
				//console.log("links", uniq[k].node_link_count);
				if(uniq[k].node_link_count > 0) {
					dup.active_node++;
				}
			}
		}
	}

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
		.gravity(1.0)   // gravity+charge tweaked to ensure good 'grouped' view (e.g. green group not smack between blue&orange, ...
		.charge(-300)    // ... charge is important to turn single-linked groups to the outside
		.friction(0.8)   // friction adjusted to get dampened display: less bouncy bouncy ball [Swedish Chef, anyone?]
		.on("tick", ticked)
		.start();

	hullg.selectAll("path.hull").remove();
	hull = hullg.selectAll("path.hull")
		.data(convexHulls(net.nodes, offset))
		.enter().append("path")
		.attr("class", "hull")
		.attr("d", drawCluster)
		//.style("fill", function(d) { return fill(d.group); })
        .style("fill",  "transparent")
		.on("click", function(d) {
			//console.log("hull click", d, arguments, this, expand[d.group]);
			expand[d.group] = false; 
			init(d3.select('#slider3textmin').html(), d3.select('#slider3textmax').html());
            //console.log(d3.select('#slider3textmin').html(), d3.select('#slider3textmax').html());
		});

	nodeg.selectAll("*").remove();
	node = nodeg.selectAll("circle.node").data(net.nodes, nodeid);
	node.exit().remove();
	node.enter().append("circle")
		// if (d.size) -- d.size > 0 when d is a group node.
		.attr("class", function(d) { return "node" + (d.size?"":" leaf"); })
		.attr("r", function(d) { return d.size ? d.active_node + radius: radius+1; })
		.attr("cx", function(d) { return d.x; })
		.attr("cy", function(d) { return d.y; })
		.style("fill", function(d) { 
			return fill(d.group); 
		})
		.style("stroke", function(d) { 
			return d3.rgb(fill(d.group)).darker();
		})
		.style("opacity", function(d) {
			if (d.size) {
				return 1;
			}
			else if (d.node_link_count == 0) {
				return 0.5;
			}
			else
				return 1;
		})
		.on("click", function(d) {
			console.log("node click", d);
			//console.log("node click", d, arguments, this, expand[d.group]);
			expand[d.group] = !expand[d.group];
			init(d3.select('#slider3textmin').html(), d3.select('#slider3textmax').html());
            //console.log(d3.select('#slider3textmin').html(), d3.select('#slider3textmax').html());
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
		.text(function(d) { return nodeLegend(d)});
	
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
		node.attr("cx", function(d) { return d.x = Math.max(radius, Math.min(width - radius, d.x)); })
			.attr("cy", function(d) { return d.y = Math.max(radius, Math.min(height - radius, d.y)); });
		//node.each(collide(0.5)); //For no collision
	}
	
	function collide(alpha) {
		var quadtree = d3.geom.quadtree(net.nodes);
		 return function(d) {
			var rb = 2*radius + padding,
			nx1 = d.x - rb,
			nx2 = d.x + rb,
			ny1 = d.y - rb,
			ny2 = d.y + rb;
			quadtree.visit(function(quad, x1, y1, x2, y2) {
			  if (quad.point && (quad.point !== d)) {
				var x = d.x - quad.point.x,
					y = d.y - quad.point.y,
					l = Math.sqrt(x * x + y * y);
					  if (l < rb) {
					  l = (l - rb) / l * alpha;
					  d.x -= x *= l;
					  d.y -= y *= l;
					  quad.point.x += x;
					  quad.point.y += y;
					}
				}
				return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
			});
		};
	}
	
	//code for static graph, not working
	/* force.start();
	for (var i = 0; i < n*n; ++i) force.tick();
	force.stop();  */
}
    
// ---------------------
//code for selecting data set from dropdown menu

d3.select("select").on("change", change)
function change() {
    var svg = d3.select("svg");
    svg.selectAll("*").remove();
    str = this.options[this.selectedIndex].value;
    var slider = d3.select('#slider3');
    slider.selectAll("*").remove();
    loadData(str);

}