/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */

window.Map = React.createClass({

  propTypes: {
    onBoundsChange: React.PropTypes.func.isRequired,
    onUpdateIntersect: React.PropTypes.func.isRequired,
    mode: React.PropTypes.string.isRequired,
  },

  componentDidMount() {
    this.initializeMap();
  },

  componentDidUpdate() {
    const { mode } = this.props;

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
  },

  initializeMap() {
    this.map = new L.Map('map', {
      center: [40.70663644882689, -73.97815704345703],
      zoom: 14,
    });

    const { map } = this;

    this.handleMoveEnd();
    map.on('moveend', this.handleMoveEnd);

    this.selectLayer = L.geoJson().addTo(map); // add empty geojson layer for selections

    // add cartodb named map
    const layerUrl = '//cwhong.cartodb.com/api/v2/viz/dacf834a-2fa8-11e5-886f-0e4fddd5de28/viz.json';

    cartodb.createLayer(map, layerUrl)
      .addTo(map)
      .on('done', (layer) => {
        this.mainLayer = layer.getSubLayer(0);
        this.mainLayer.setInteraction(false);

        this.ntaLayer = layer.getSubLayer(1);
        this.ntaLayer.hide();  // hide neighborhood polygons
        this.ntaLayer.on('featureClick', this.highlightNta);
      });

    const drawOptions = {
      position: 'topright',
      draw: {
        polyline: false,
        polygon: {
          allowIntersection: false, // Restricts shapes to simple polygons
          drawError: {
            color: '#e1e100', // Color the shape will turn when intersects
            message: '<strong>Oh snap!<strong> you can\'t draw that!', // Message that will show when intersect
          },
          shapeOptions: {
            color: '#bada55',
          },
        },
        circle: false, // Turns off this drawing tool
        rectangle: {
          shapeOptions: {
            clickable: false,
          },
        },
        marker: false,
      },
    };

    const drawControl = new L.Control.Draw(drawOptions);
    map.addControl(drawControl);
    this.hideDrawControls();

    map.on('draw:created', this.handleDrawCreated);

    map.on('draw:drawstart', () => {
      if (this.drawnLayer) {
        this.map.removeLayer(this.drawnLayer);
      }
    });
  },

  handleDrawCreated(e) {
    this.drawnLayer = e.layer;
    this.map.addLayer(this.drawnLayer);
    this.props.onUpdateIntersect(this.makeSqlPolygon(e.layer._latlngs));
  },

  makeSqlPolygon(coords) {
    let firstCoord;

    const coordStrings = [];
    coords.forEach((coord) => {
      coordStrings.push(`${coord.lng} ${coord.lat}`);
    });
    coordStrings.push(coordStrings[0]); // repeat first coordinate

    const sqlPolygon = `ST_SETSRID(ST_PolygonFromText('POLYGON((${coordStrings.join(',')}))'),4326)`;
    return sqlPolygon;
  },

  handleMoveEnd() {
    this.props.onBoundsChange(this.map.getBounds());
  },

  highlightNta(e, latlng, pos, data) {
    const { onUpdateIntersect } = this.props;

    this.selectLayer.clearLayers();

    const sql = new cartodb.SQL({ user: 'cwhong' });
    const query = `SELECT the_geom FROM nynta WHERE cartodb_id = ${data.cartodb_id}`;
    sql.execute(query, {}, { format: 'GeoJSON' })
      .done((d) => {
        this.selectLayer.addData(d);
        // setup SQL statement for intersection
        const intersect = `(SELECT the_geom FROM nynta WHERE cartodb_id = ${data.cartodb_id})`;
        onUpdateIntersect(intersect);
      });
  },

  showDrawControls() {
    $('.leaflet-draw-toolbar').show();
  },

  hideDrawControls() {
    $('.leaflet-draw-toolbar').hide();
  },

  render() {
    return (<div id="map" />);
  },
});
