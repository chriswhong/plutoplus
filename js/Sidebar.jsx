/* eslint-disable no-undef */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */
window.Sidebar = (props) => {
  const { mode, fields, intersect, onModeChange, onDownload, onFieldChange, onSelectAll, onSelectNone } = props;

  const disabled = intersect === null ? 'disabled' : '';

  let downloadMessage = '';
  if (mode === 'neighborhood' && intersect === null) downloadMessage = 'Select a neighborhood';
  if (mode === 'polygon' && intersect === null) downloadMessage = 'Draw a polygon';

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
        <li
          className="u-vspace-xxl"
          style={{
            position: 'absolute',
            top: '16px',
            zIndex: 100,
          }}
        >
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

        <li className="u-vspace-xxl columns-pane" style={{ width: 'calc(100% - 32px)' }}>
          <div className="u-vspace-l clearfix">
            <div className="u-left">
              <span className="Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign">2</span> <h2 className="u-iblock u-malign"><strong>Choose Columns</strong></h2>
            </div>
            <p className="u-right"><a href="#" onClick={onSelectAll}>All</a> | <a href="#" onClick={onSelectNone}>None</a></p>
          </div>
          <div
            className="u-vspace-xxl"
            style={{
              position: 'absolute',
              top: '200px',
              bottom: '87px',
              overflow: 'scroll',
              width: '100%',
            }}
          >
            <div className="well u-pr">
              <div className="well-inner">
                <ul className="list-group checked-list-box fieldList u-pr" >
                  {fieldListItems}
                </ul>
              </div>
            </div>
          </div>
        </li>

        <li className="download-pane">
          <div className="u-vspace-l">
            <span className="Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign">3</span>
            <h2 className="u-iblock u-malign"><strong>Download!</strong></h2> <p>{downloadMessage}</p>
          </div>
          <ul className="u-ilist u-vspace-xxl">
            <li>
              <p className="button button--small button--blue">
                <a href="#" className={`btn btn-sm btn-success ${disabled}`} onClick={onDownload.bind(this, 'geojson')}>geoJson</a>
              </p>
            </li>
            <li>
              <p className="button button--small button--blue">
                <a href="#" className={`btn btn-sm btn-success ${disabled}`} onClick={onDownload.bind(this, 'csv')}>CSV</a>
              </p>
            </li>
            <li>
              <p className="button button--small button--blue">
                <a href="#" className={`btn btn-sm btn-success ${disabled}`} onClick={onDownload.bind(this, 'shp')}>Shapefile</a>
              </p>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
};

window.Sidebar.propTypes = {
  mode: React.PropTypes.string.isRequired,
  fields: React.PropTypes.array.isRequired,
  intersect: React.PropTypes.string.isRequired,
  onModeChange: React.PropTypes.func.isRequired,
  onDownload: React.PropTypes.func.isRequired,
  onFieldChange: React.PropTypes.func.isRequired,
  onSelectAll: React.PropTypes.func.isRequired,
  onSelectNone: React.PropTypes.func.isRequired,
};


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
