d3.select('#slider3').call(d3.slider().axis(true).value( [ 10, 25 ] ).on("slide", function(evt, value) {
      init(value[ 0 ] ,value[ 1 ]);
    }));