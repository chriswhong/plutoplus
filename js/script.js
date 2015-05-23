//initialize map
var map = new L.Map('map', { 
  center: [40.70663644882689,-73.97815704345703],
  zoom: 14
});

//add a basemap
L.tileLayer('https://dnv9my2eseobd.cloudfront.net/v3/cartodb.map-4xtxp73f/{z}/{x}/{y}.png', {
  attribution: 'Mapbox <a href="http://mapbox.com/about/maps" target="_blank">Terms &amp; Feedback</a>'
}).addTo(map);

  //add cartodb named map
var layerUrl = 'https://cwhong.cartodb.com/api/v2/viz/3a52aa84-00c6-11e5-9106-0e0c41326911/viz.json';

cartodb.createLayer(map, layerUrl)
  .addTo(map)
  .on('done', function(layer) {

  }).on('error', function() {
    //log the error
  });

//populate fields list
$.getJSON('data/fields.json',function(data){

  console.log(data.length);
  data.forEach(function(field) {
    var listItem = '<li class="list-group-item">' + field.name + '</li>'
    $('.fieldList').append(listItem);
  });

  //custom functionality for checkboxes
  initCheckboxes();
});

$('#splashModal').modal('show');

//listeners
$('#selectAll').click(function(){
  $(".fieldList li").click(); 
  listChecked();
}); 

$('.download').click(function(){

  var data = {};

  //get current view, download type, and checked fields
  var bbox = map.getBounds();
  data.type = $(this).attr('id');
  var checked = listChecked();

  //generate comma-separated list of fields
  data.fields = '';
  for(var i=0;i<checked.length;i++) {
    if(checked[i]!='bbl') {
      data.fields+= checked[i] + ',';
    }
  }
  data.fields=data.fields.slice(0,-1);


  data.bboxString = bbox._southWest.lng + ',' 
    + bbox._southWest.lat + ','
    + bbox._northEast.lng + ','
    + bbox._northEast.lat;

  var queryTemplate = 'https://cwhong.cartodb.com/api/v2/sql?skipfields=sbbl,cartodb_id,created_at,updated_at,name,description&format={{type}}&filename=pluto&q=SELECT * FROM plutoshapes a LEFT OUTER JOIN (SELECT bbl,{{fields}} FROM pluto14v2) b ON a.sbbl = b.bbl WHERE ST_INTERSECTS(ST_MakeEnvelope({{bboxString}},4326), a.the_geom)';


  var buildquery = Handlebars.compile(queryTemplate);

  var url = buildquery(data);

  console.log("Downloading " + url);

  window.open(url, 'My Download'); 

});

//functions



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