window.config = {
  // Leaflet map options
  // http://leafletjs.com/reference.html#map-class
  map: {
    center: [40.70663644882689, -73.97815704345703],
    zoom: 14,
    layers: [
      L.tileLayer(
        'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}.png',
        {
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      )
    ]
  },
  // Carto username
  username: 'cwhong',
  // Main Vis/Dataset
  dataset: {
    table: 'pluto16v2',
    fields: 'examples/nyc-pluto/data/fields.json',
    vis: '//cwhong.cartodb.com/api/v2/viz/dacf834a-2fa8-11e5-886f-0e4fddd5de28/viz.json',
  },
  // Overlay/Select Areas
  areas: [
    {
      id: 'neighborhood',
      // Control displayed text
      text: {
        default: 'Neighborhood',
        select: 'Select a neighborhood',
      },
      // Sublayer table
      table: 'nynta',
      // Sublayer options
      // https://carto.com/docs/carto-engine/carto-js/api-methods#layercreatesublayerlayerdefinition
      // default => username: config.username
      sublayer: {
        sql: 'SELECT * FROM nynta',
        cartocss: '#nynta { polygon-fill: #FF6600; polygon-opacity: 0; line-color: #e8ff00; line-width: 2; line-opacity: 0.7; }',
        interactivity: 'cartodb_id, ntaname',
      },
      // Tooltip
      // make sure proper fields passed to interactivity above
      tooltip: {
        template: (data) => data.ntaname
      }
    },
    {
      id: 'special-district',
      text: {
        default: 'Special Planned District',
        select: 'Select a Distrct',
      },
      table: 'nysp',
      sublayer: {
        sql: 'SELECT * FROM nysp',
        cartocss: '#nysp { polygon-fill: #FF6600; polygon-opacity: 0; line-color: #e8ff00; line-width: 2; line-opacity: 0.7; }',
        interactivity: 'cartodb_id, sdname',
      },
      tooltip: {
        template: (data) => data.sdname
      }
    },
  ],
  // Export types
  export: ['geojson', 'csv', 'shp']
};
