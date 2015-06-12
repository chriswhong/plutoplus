var areaType='currentView';
var drawnLayer;
var mainLayer;

//initialize map
var map = new L.Map('map', { 
  center: [40.70663644882689,-73.97815704345703],
  zoom: 14
});

//add a basemap
L.tileLayer('https://dnv9my2eseobd.cloudfront.net/v3/cartodb.map-4xtxp73f/{z}/{x}/{y}.png', {
  attribution: 'Mapbox <a href="http://mapbox.com/about/maps" target="_blank">Terms &amp; Feedback</a>'
}).addTo(map);

//leaflet draw stuff

var options = {
    position: 'topright',
    draw: {
        polyline:false,
        polygon: {
            allowIntersection: false, // Restricts shapes to simple polygons
            drawError: {
                color: '#e1e100', // Color the shape will turn when intersects
                message: '<strong>Oh snap!<strong> you can\'t draw that!' // Message that will show when intersect
            },
            shapeOptions: {
                color: '#bada55'
            }
        },
        circle: false, // Turns off this drawing tool
        rectangle: {
            shapeOptions: {
                clickable: false
            }
        },
        marker:false
    }
};

var drawControl = new L.Control.Draw(options);

var customPolygon;
map.on('draw:created', function (e) {
    //hide the arrow
    $('.infoArrow').hide();

    var type = e.layerType,
        layer = e.layer;

    console.log(e.layer);
    drawnLayer=e.layer;

    var coords = e.layer._latlngs;
    console.log(coords);
    customPolygon = makeSqlPolygon(coords);
    // Do whatever else you need to. (save to db, add to map etc)
    map.addLayer(layer);
    $('.download').removeAttr('disabled');
});

map.on('draw:drawstart', function (e) {
  console.log('start');
  if (drawnLayer) {
    map.removeLayer(drawnLayer);
  }
});

//add cartodb named map
var layerUrl = 'https://cwhong.cartodb.com/api/v2/viz/2602ab80-0353-11e5-89a0-0e0c41326911/viz.json';

cartodb.createLayer(map, layerUrl)
  .addTo(map)
  .on('done', function(layer) {
    mainLayer = layer.getSubLayer(0);
    console.log(mainLayer);
  }).on('error', function() {
    //log the error
  });

//populate fields list
$.getJSON('data/fields.json',function(data){

  console.log(data.length);
  data.forEach(function(field) {
    var listItem = '<li id = "' + field.name + '" class="list-group-item">' 
      + field.name 
      + '<span class="glyphicon glyphicon-info-sign icon-right" aria-hidden="true"></span></li>'
    
    $('.fieldList').append(listItem);
    $('#' + field.name).data("description",field.description);
    
  });

  //listener for hovers
  $('.icon-right').hover(showDescription,hideDescription);

  function showDescription() {
    var o = $(this).offset();

    var data = $(this).parent().data('description');
    console.log(data);

    $('#infoWindow')
      .html(data)
      .css('top',o.top)
      .css('left',o.left-210)
      .fadeIn(150);

    
  }

  function hideDescription() {
    $('#infoWindow')
      .fadeOut(150);
  }


  //custom functionality for checkboxes
  initCheckboxes();
});

//$('#splashModal').modal('show');

//listeners
$('#selectAll').click(function(){
  $(".fieldList li").click(); 
  listChecked();
}); 

$('input[type=radio][name=area]').change(function() {
  if(this.value == 'polygon') {
    areaType='polygon';
    map.addControl(drawControl);
    $('.infoArrow').show();
    mainLayer.setInteraction(false);
    $('.download').attr('disabled','disabled');
  }
  if(this.value == 'currentView') {
    areaType='currentView';
    mainLayer.setInteraction(true);
    map.removeControl(drawControl);
    $('.infoArrow').hide();
    if (drawnLayer) {
    map.removeLayer(drawnLayer);
  }
  }
})

//runs when any of the download buttons is clicked
$('.download').click(function(){

  var data = {};

  //get current view, download type, and checked fields
  var bbox = map.getBounds();
  data.intersects = customPolygon;
  data.type = $(this).attr('id');
  var checked = listChecked();

  //generate comma-separated list of fields
  data.fields = '';
  for(var i=0;i<checked.length;i++) {
    if(checked[i]!='bbl') {
      data.fields+= checked[i] + ',';
    }
  }

  //only add leading comma if at least one field is selected
  if(data.fields.length>0) {
    data.fields=',' + data.fields.slice(0,-1);
  }
  

  if(areaType == 'currentView') {
    var bboxString = bbox._southWest.lng + ',' 
    + bbox._southWest.lat + ','
    + bbox._northEast.lng + ','
    + bbox._northEast.lat;

    data.intersects = 'ST_MakeEnvelope(' + bboxString + ',4326)';
  }

  if(areaType == 'polygon') {
    data.intersects = customPolygon;
  }
  
  if(data.type == 'cartodb') {
    data.type = 'geojson';
    data.cartodb = true;
  }

  var queryTemplate = 'https://cwhong.cartodb.com/api/v2/sql?skipfields=sbbl,cartodb_id,created_at,updated_at,name,description&format={{type}}&filename=pluto&q=SELECT * FROM plutoshapes a LEFT OUTER JOIN (SELECT bbl{{fields}} FROM pluto14v2) b ON a.sbbl = b.bbl WHERE ST_INTERSECTS({{{intersects}}}, a.the_geom)';


  var buildquery = Handlebars.compile(queryTemplate);

  var url = buildquery(data);

  console.log("Downloading " + url);

  //http://oneclick.cartodb.com/?file={{YOUR FILE URL}}&provider={{PROVIDER NAME}}&logo={{YOUR LOGO URL}}
  if(data.cartodb) {
    url = encodeURIComponent(url);
    console.log(url);
    url = 'http://oneclick.cartodb.com/?file=' + url + '&provider=plutoplus';
    console.log(url);
  } 
    
  window.open(url, 'My Download');
  

   

});

//functions
//turns an array of latLngs into an ST_POLYGONFROMTEXT
function makeSqlPolygon(coords) {
  var s = "ST_SETSRID(ST_PolygonFromText(\'POLYGON((";
  var firstCoord;
  coords.forEach(function(coord,i){
    console.log(coord);
    s+=coord.lng + " " + coord.lat + ","

    //remember the first coord
    if(i==0) {
      firstCoord = coord;
    }

    if(i==coords.length-1) {
      s+=firstCoord.lng + " " + firstCoord.lat;
    }
  });
  s+="))\'),4326)"
  console.log(s);
  return s;
}

function initCheckboxes() {
  //sweet checkbox list from http://bootsnipp.com/snippets/featured/checked-list-group
  $('.list-group.checked-list-box .list-group-item').each(function () {
      
      // Settings
      var $widget = $(this),
          $checkbox = $('<input type="checkbox" class="hidden" />'),
          color = ($widget.data('color') ? $widget.data('color') : "primary"),
          style = ($widget.data('style') == "button" ? "btn-" : "list-group-item-"),
          settings = {
              on: {
                  icon: 'glyphicon glyphicon-check'
              },
              off: {
                  icon: 'glyphicon glyphicon-unchecked'
              }
          };
          
      $widget.css('cursor', 'pointer')
      $widget.append($checkbox);

      // Event Handlers
      $widget.on('click', function () {
          $checkbox.prop('checked', !$checkbox.is(':checked'));
          $checkbox.triggerHandler('change');
          updateDisplay();
      });
      $checkbox.on('change', function () {
          updateDisplay();
      });
        

      // Actions
      function updateDisplay() {
          var isChecked = $checkbox.is(':checked');

          // Set the button's state
          $widget.data('state', (isChecked) ? "on" : "off");

          // Set the button's icon
          $widget.find('.state-icon')
              .removeClass()
              .addClass('state-icon ' + settings[$widget.data('state')].icon);

          // Update the button's color
          if (isChecked) {
              $widget.addClass(style + color + ' active');
          } else {
              $widget.removeClass(style + color + ' active');
          }
      }

      // Initialization
      function init() {
          
          if ($widget.data('checked') == true) {
              $checkbox.prop('checked', !$checkbox.is(':checked'));
          }
          
          updateDisplay();

          // Inject the icon if applicable
          if ($widget.find('.state-icon').length == 0) {
            $widget.prepend('<span class="state-icon ' + settings[$widget.data('state')].icon + '"></span>');
          }
      }
      init();
  });
};

function listChecked() { 
  var checkedItems = [];
  $(".fieldList li.active").each(function(idx, li) {
      checkedItems.push($(li).text());
  });
  console.log(checkedItems);
  return checkedItems;
}