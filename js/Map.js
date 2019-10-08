var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */

var Map = function (_React$Component) {
  _inherits(Map, _React$Component);

  function Map(props) {
    _classCallCheck(this, Map);

    var _this = _possibleConstructorReturn(this, (Map.__proto__ || Object.getPrototypeOf(Map)).call(this, props));

    _this.highlightNta = _this.highlightNta.bind(_this);
    _this.handleMoveEnd = _this.handleMoveEnd.bind(_this);
    _this.handleDrawCreated = _this.handleDrawCreated.bind(_this);
    return _this;
  }

  _createClass(Map, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      this.initializeMap();
    }
  }, {
    key: 'componentDidUpdate',
    value: function componentDidUpdate() {
      var mode = this.props.mode;


      if (this.ntaLayer) {
        if (mode === 'neighborhood') {
          this.ntaLayer.show();
        } else {
          if (this.ntaLayer.isVisible) this.ntaLayer.hide();
          this.selectLayer.clearLayers();
        }
      }

      if (mode === 'polygon') {
        this.showDrawControls();
      } else {
        this.hideDrawControls();
      }
    }
  }, {
    key: 'initializeMap',
    value: function initializeMap() {
      var _this2 = this;

      this.map = new L.Map('map', {
        center: [40.70663644882689, -73.97815704345703],
        zoom: 14
      });

      var map = this.map;


      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      this.handleMoveEnd();
      map.on('moveend', this.handleMoveEnd);

      this.selectLayer = L.geoJson().addTo(map); // add empty geojson layer for selections

      // add cartodb named map
      var layerUrl = './data/viz.json';
      fetch('./data/viz.json').then(function (d) {
        return d.json();
      }).then(function (vizJson) {
        cartodb.createLayer(map, vizJson).addTo(map).on('done', function (layer) {
          _this2.mainLayer = layer.getSubLayer(0);
          _this2.mainLayer.setInteraction(false);

          _this2.ntaLayer = layer.getSubLayer(1);
          _this2.ntaLayer.hide(); // hide neighborhood polygons
          _this2.ntaLayer.on('featureClick', _this2.highlightNta);
        });
      });

      var drawOptions = {
        position: 'topright',
        draw: {
          polyline: false,
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
          circlemarker: false,
          rectangle: {
            shapeOptions: {
              clickable: false
            }
          },
          marker: false
        }
      };

      var drawControl = new L.Control.Draw(drawOptions);
      map.addControl(drawControl);
      this.hideDrawControls();

      map.on('draw:created', this.handleDrawCreated);

      map.on('draw:drawstart', function () {
        if (_this2.drawnLayer) {
          _this2.map.removeLayer(_this2.drawnLayer);
        }
      });
    }
  }, {
    key: 'handleDrawCreated',
    value: function handleDrawCreated(e) {
      this.drawnLayer = e.layer;
      this.map.addLayer(this.drawnLayer);
      this.props.onUpdateIntersect(this.makeSqlPolygon(e.layer._latlngs));
    }
  }, {
    key: 'makeSqlPolygon',
    value: function makeSqlPolygon(coords) {
      var firstCoord = void 0;

      var coordStrings = [];
      coords.forEach(function (coord) {
        coordStrings.push(coord.lng + ' ' + coord.lat);
      });
      coordStrings.push(coordStrings[0]); // repeat first coordinate

      var sqlPolygon = 'ST_SETSRID(ST_PolygonFromText(\'POLYGON((' + coordStrings.join(',') + '))\'),4326)';
      return sqlPolygon;
    }
  }, {
    key: 'handleMoveEnd',
    value: function handleMoveEnd() {
      this.props.onBoundsChange(this.map.getBounds());
    }
  }, {
    key: 'highlightNta',
    value: function highlightNta(e, latlng, pos, data) {
      var _this3 = this;

      var onUpdateIntersect = this.props.onUpdateIntersect;


      this.selectLayer.clearLayers();

      var sql = new cartodb.SQL({ user: 'planninglabs' });
      var query = 'SELECT the_geom FROM nta_boundaries_v0 WHERE cartodb_id = ' + data.cartodb_id;
      sql.execute(query, {}, { format: 'GeoJSON' }).done(function (d) {
        _this3.selectLayer.addData(d);
        // setup SQL statement for intersection
        var intersect = '(SELECT the_geom FROM nta_boundaries_v0 WHERE cartodb_id = ' + data.cartodb_id + ')';
        onUpdateIntersect(intersect);
      });
    }
  }, {
    key: 'showDrawControls',
    value: function showDrawControls() {
      $('.leaflet-draw-toolbar').show();
    }
  }, {
    key: 'hideDrawControls',
    value: function hideDrawControls() {
      $('.leaflet-draw-toolbar').hide();
    }
  }, {
    key: 'render',
    value: function render() {
      return React.createElement('div', { id: 'map' });
    }
  }]);

  return Map;
}(React.Component);

;

window.Map = Map;