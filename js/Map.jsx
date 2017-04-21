/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */


const popup = $("<div class='tooltip' id='infoWindow'></div>");
popup.hide();

window.Map = React.createClass({

  propTypes: {
    onBoundsChange: React.PropTypes.func.isRequired,
    onUpdateIntersect: React.PropTypes.func.isRequired,
    mode: React.PropTypes.string.isRequired,
  },

  componentDidMount() {
    this.initializeMap();
  },

  componentDidUpdate(prevProps) {
    const { mode } = this.props;

    if (mode !== prevProps.mode) {
      this.selectLayer.clearLayers();
      if (this.drawnLayer) {
        this.map.removeLayer(this.drawnLayer);
      }
    }

    const area = config.areas[0];

    this.layers.forEach((layer, i) => {
      const area = config.areas[i];
      if (mode === area.id) {
        this.layers[i].show();
      } else {
        if (this.layers[i].isVisible) {
          this.layers[i].hide();
        }
      }
    })

    if (mode === 'polygon') {
      this.showDrawControls();
    } else {
      this.hideDrawControls();
    }
  },

  initializeMap() {
    this.map = new L.Map('map', config.map);

    const { map } = this;

    this.handleMoveEnd();
    map.on('moveend', this.handleMoveEnd);

    this.selectLayer = L.geoJson().addTo(map); // add empty geojson layer for selections

    this.layers = [];

    cartodb.createLayer(map, config.dataset.vis)
      .addTo(map)
      .on('done', (layer) => {
        const that = this;
        this.mainLayer = layer.getSubLayer(0);
        this.mainLayer.setInteraction(false);
        // Clear sublayers other than the base
        layer.getSubLayers().forEach((sublayer, i) => { if(i > 0) { sublayer.remove() }});

        popup.appendTo("#map");
        for (let i = 0; i < config.areas.length; i++) {
          let area = config.areas[i];
          let sublayer = layer.createSubLayer({ username: config.username, ...area.sublayer });
          sublayer.hide(); // Initially hide

          sublayer.setInteraction(true);

          sublayer.on('featureClick', function(e, latlng, pos, data) {
            that.highlightLayer(e, latlng, pos, data, i);
          })
          .on('error', function() {
            //log the error
            console.log("Failed creating sublayer");
          })

          // Tooltip
          if (area.tooltip) {
            const tooltip = area.tooltip;
            const offset = tooltip.offset || { x: 0, y: 0};
            sublayer.on("mouseover", function (e, latlng, pos, data) {
              popup.html(tooltip.template(data));
              let xPos = pos.x + offset.x;
              let yPos = pos.y + offset.y;

              // Tweaks to handle tooltip overflowing the screen
              // There's probably a better way to do this
              popup.removeClass('no-carot');
              if (xPos < 100) {
                xPos = 100;
                popup.addClass('no-carot');
              }
              if (yPos < 10) {
                yPos = 50;
                popup.addClass('no-carot');
              }
              ////////

              popup.css({ left: xPos, top: yPos })
              popup.show();
            })

            sublayer.on("mouseout", function (e, latlng, pos, data) {
              popup.hide();
            })
          }

          this.layers.push(sublayer);
        }
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

  highlightLayer(e, latlng, pos, data, i) {
    const { onUpdateIntersect } = this.props;
    const area = config.areas[i];

    this.selectLayer.clearLayers();

    const sql = new cartodb.SQL({ user: config.username });
    const query = `SELECT the_geom FROM ${area.table} WHERE cartodb_id = ${data.cartodb_id}`;
    sql.execute(query, {}, { format: 'GeoJSON' })
      .done((d) => {
        this.selectLayer.addData(d);
        // setup SQL statement for intersection
        const intersect = `(SELECT the_geom FROM ${area.table} WHERE cartodb_id = ${data.cartodb_id})`;
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
