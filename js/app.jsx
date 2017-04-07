/* eslint-disable no-undef */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */
const App = React.createClass({

  getInitialState() {
    return {
      mode: 'currentView',
      fields: [],
    };
  },

  componentDidMount() {
    const self = this;
    $.getJSON('data/fields.json', (fields) => {
      fields.forEach((field) => {
        field.checked = false;
      });

      self.setState({ fields });
    });
  },

  // returns a PostGIS geometry for intersection based on the current mode
  getDataIntersect() {
    const { mode, bounds } = this.state;

    if (mode === 'currentView') {
      return `
        ST_MakeEnvelope(
          ${bounds._southWest.lng},
          ${bounds._southWest.lat},
          ${bounds._northEast.lng},
          ${bounds._northEast.lat},
        4326)
      `;
    }

    return null;
  },

  // returns
  getFields() {
    const { fields } = this.state;

    const checkedFields = fields.filter(field => field.checked === true); // filter for checked
    const fieldsValues = checkedFields.map(field => field.value); // map to just the values
    fieldsValues.unshift('the_geom'); // add 'the_geom' to the beginning of the array
    return fieldsValues.join(',');
  },

  handleModeChange(e) {
    this.setState({ mode: e.target.value });
  },

  handleDownload(type) {
    const dataIntersect = this.getDataIntersect();
    const fields = this.getFields();
    const apiCall = `//cwhong.cartodb.com/api/v2/sql?skipfields=cartodb_id,created_at,updated_at,name,description&format=${type}&filename=pluto&q=SELECT ${fields} FROM pluto16v2 a WHERE ST_INTERSECTS(${dataIntersect}, a.the_geom)`;

    console.log(`Calling SQL API: ${apiCall}`); // eslint-disable-line
    window.open(apiCall, 'Download');
  },

  handleBoundsChange(bounds) {
    this.setState({ bounds });
  },

  handleFieldChange(e) {
    const { value } = e.target;
    const { fields } = this.state;

    const thisField = fields.filter(field => field.value === value)[0];

    thisField.checked = !thisField.checked;

    this.setState({ fields });
  },

  handleSelectAll() {
    const { fields } = this.state;
    fields.forEach((field) => {
      field.checked = true;
    });
    this.setState({ fields });
  },

  handleSelectNone() {
    const { fields } = this.state;
    fields.forEach((field) => {
      field.checked = false;
    });
    this.setState({ fields });
  },

  render() {
    const { mode, fields } = this.state;

    return (
      <div>
        <Map
          mode={mode}
          onBoundsChange={this.handleBoundsChange}
        />
        <Sidebar
          fields={fields}
          mode={mode}
          onModeChange={this.handleModeChange}
          onDownload={this.handleDownload}
          onFieldChange={this.handleFieldChange}
          onSelectAll={this.handleSelectAll}
          onSelectNone={this.handleSelectNone}
        />
      </div>
    );
  },
});

const Map = React.createClass({

  propTypes: {
    onBoundsChange: React.PropTypes.func.isRequired,
  },

  componentDidMount() {
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
        this.ntaLayer.on('featureClick', () => {});
      });
  },

  handleMoveEnd() {
    this.props.onBoundsChange(this.map.getBounds());
  },

  render() {
    return (<div id="map" />);
  },
});

const Sidebar = React.createClass({

  propTypes: {
    mode: React.PropTypes.string.isRequired,
    fields: React.PropTypes.array.isRequired,
    onModeChange: React.PropTypes.func.isRequired,
    onDownload: React.PropTypes.func.isRequired,
    onFieldChange: React.PropTypes.func.isRequired,
    onSelectAll: React.PropTypes.func.isRequired,
    onSelectNone: React.PropTypes.func.isRequired,
  },


  render() {
    const { mode, fields, onModeChange, onDownload, onFieldChange, onSelectAll, onSelectNone } = this.props;

    const fieldListItems = fields.map(field => (
      <li className="list-group-item" key={field.value}>
        <Checkbox
          checked={field.checked}
          value={field.value}
          onChange={onFieldChange}
        />
        {field.value}
        <span data-tip={field.description} className="glyphicon glyphicon-info-sign icon-right" aria-hidden="true" />
        <ReactTooltip className="tooltip" place="right" type="dark" effect="solid" />
      </li>
    ));

    return (
      <div id="sidebar">
        <ul className="List-blocks">
          <li className="u-vspace-xxl">
            <div className="u-vspace-l">
              <span className="Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign">1</span>
              <h2 className="u-iblock u-malign"><strong>Choose Area</strong></h2>
            </div>

            <ul className="ListOptions u-vspace-xxl">
              <li>
                <label>
                  <input
                    className="u-iblock u-malign"
                    type="radio"
                    value="currentView"
                    checked={mode === 'currentView'}
                    onChange={onModeChange}
                  />
                  <p className="u-iblock u-malign"> Current Map View</p>
                </label>
              </li>
              <li>
                <label>
                  <input
                    className="u-iblock u-malign"
                    type="radio"
                    value="neighborhood"
                    checked={mode === 'neighborhood'}
                    onChange={onModeChange}
                  />
                  <p className="u-iblock u-malign"> Neighborhood </p>
                </label>
              </li>
              <li>
                <label>
                  <input
                    className="u-iblock u-malign"
                    type="radio"
                    value="polygon"
                    checked={mode === 'polygon'}
                    onChange={onModeChange}
                  />
                  <p className="u-iblock u-malign"> Draw a polygon</p>
                </label>
              </li>
            </ul>
          </li>

          <li className="u-vspace-xxl">
            <div className="u-vspace-l clearfix">
              <div className="u-left">
                <span className="Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign">2</span> <h2 className="u-iblock u-malign"><strong>Choose Columns</strong></h2>
              </div>
              <p className="u-right"><a href="#" onClick={onSelectAll}>All</a> | <a href="#" onClick={onSelectNone}>None</a></p>
            </div>
            <div className="u-vspace-xxl">
              <div className="well u-pr" style={{ height: '215px' }}>
                <div
                  className="well-inner"
                  style={{
                    height: '215px',
                    overflow: 'auto',
                  }}
                >
                  <ul className="list-group checked-list-box fieldList u-pr" >
                    {fieldListItems}
                  </ul>
                </div>
              </div>
            </div>
          </li>

          <li>
            <div className="u-vspace-l">
              <span className="Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign">3</span> <h2 className="u-iblock u-malign"><strong>Download!</strong></h2>
            </div>
            <ul className="u-ilist u-vspace-xxl">
              <li>
                <p className="button button--small button--blue">
                  <a href="#" className="btn btn-sm btn-success" onClick={onDownload.bind(this, 'geojson')}>geoJson</a>
                </p>
              </li>
              <li>
                <p className="button button--small button--blue">
                  <a href="#" className="btn btn-sm btn-success" onClick={onDownload.bind(this, 'csv')}>CSV</a>
                </p>
              </li>
              <li>
                <p className="button button--small button--blue">
                  <a href="#" className="btn btn-sm btn-success" onClick={onDownload.bind(this, 'shp')}>Shapefile</a>
                </p>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    );
  },
});

const Checkbox = props => (
  <div className="checkbox">
    <input
      type="checkbox"
      className={`glyphicon ${props.checked ? 'glyphicon-check' : 'glyphicon-unchecked'}`}
      value={props.value}
      checked={props.checked}
      onChange={props.onChange}
    />
  </div>
);

Checkbox.propTypes = {
  value: React.PropTypes.string.isRequired,
  checked: React.PropTypes.bool.isRequired,
  onChange: React.PropTypes.func.isRequired,
};

ReactDOM.render(<App />, document.getElementById('main'));
