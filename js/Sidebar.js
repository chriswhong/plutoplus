var _this = this;

/* eslint-disable no-undef */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */
window.Sidebar = function (props) {
  var mode = props.mode,
      fields = props.fields,
      intersect = props.intersect,
      onModeChange = props.onModeChange,
      onDownload = props.onDownload,
      onFieldChange = props.onFieldChange,
      onSelectAll = props.onSelectAll,
      onSelectNone = props.onSelectNone;


  var disabled = intersect === null ? 'disabled' : '';

  var downloadMessage = '';
  if (mode === 'neighborhood' && intersect === null) downloadMessage = 'Select a neighborhood';
  if (mode === 'polygon' && intersect === null) downloadMessage = 'Draw a polygon';

  var fieldListItems = fields.map(function (field) {
    return React.createElement(
      'li',
      { className: 'list-group-item', key: field.value },
      React.createElement(Checkbox, {
        checked: field.checked,
        value: field.value,
        onChange: onFieldChange
      }),
      field.value,
      React.createElement('span', { 'data-tip': field.description, className: 'glyphicon glyphicon-info-sign icon-right', 'aria-hidden': 'true' }),
      React.createElement(ReactTooltip, { className: 'tooltip', place: 'right', type: 'dark', effect: 'solid' })
    );
  });

  return React.createElement(
    'div',
    { id: 'sidebar' },
    React.createElement(
      'ul',
      { className: 'List-blocks' },
      React.createElement(
        'li',
        {
          className: 'u-vspace-xxl',
          style: {
            position: 'absolute',
            top: '16px',
            zIndex: 100
          }
        },
        React.createElement(
          'div',
          { className: 'u-vspace-l' },
          React.createElement(
            'span',
            { className: 'Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign' },
            '1'
          ),
          React.createElement(
            'h2',
            { className: 'u-iblock u-malign' },
            React.createElement(
              'strong',
              null,
              'Choose Area'
            )
          )
        ),
        React.createElement(
          'ul',
          { className: 'ListOptions u-vspace-xxl' },
          React.createElement(
            'li',
            null,
            React.createElement(
              'label',
              null,
              React.createElement('input', {
                className: 'u-iblock u-malign',
                type: 'radio',
                value: 'currentView',
                checked: mode === 'currentView',
                onChange: onModeChange
              }),
              React.createElement(
                'p',
                { className: 'u-iblock u-malign' },
                ' Current Map View'
              )
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'label',
              null,
              React.createElement('input', {
                className: 'u-iblock u-malign',
                type: 'radio',
                value: 'neighborhood',
                checked: mode === 'neighborhood',
                onChange: onModeChange
              }),
              React.createElement(
                'p',
                { className: 'u-iblock u-malign' },
                ' Neighborhood '
              )
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'label',
              null,
              React.createElement('input', {
                className: 'u-iblock u-malign',
                type: 'radio',
                value: 'polygon',
                checked: mode === 'polygon',
                onChange: onModeChange
              }),
              React.createElement(
                'p',
                { className: 'u-iblock u-malign' },
                ' Draw a polygon'
              )
            )
          )
        )
      ),
      React.createElement(
        'li',
        { className: 'u-vspace-xxl columns-pane', style: { width: 'calc(100% - 32px)' } },
        React.createElement(
          'div',
          { className: 'u-vspace-l clearfix' },
          React.createElement(
            'div',
            { className: 'u-left' },
            React.createElement(
              'span',
              { className: 'Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign' },
              '2'
            ),
            ' ',
            React.createElement(
              'h2',
              { className: 'u-iblock u-malign' },
              React.createElement(
                'strong',
                null,
                'Choose Columns'
              )
            )
          ),
          React.createElement(
            'p',
            { className: 'u-right' },
            React.createElement(
              'a',
              { href: '#', onClick: onSelectAll },
              'All'
            ),
            ' | ',
            React.createElement(
              'a',
              { href: '#', onClick: onSelectNone },
              'None'
            )
          )
        ),
        React.createElement(
          'div',
          {
            className: 'u-vspace-xxl',
            style: {
              position: 'absolute',
              top: '200px',
              bottom: '87px',
              overflow: 'scroll',
              width: '100%'
            }
          },
          React.createElement(
            'div',
            { className: 'well u-pr' },
            React.createElement(
              'div',
              { className: 'well-inner' },
              React.createElement(
                'ul',
                { className: 'list-group checked-list-box fieldList u-pr' },
                fieldListItems
              )
            )
          )
        )
      ),
      React.createElement(
        'li',
        { className: 'download-pane' },
        React.createElement(
          'div',
          { className: 'u-vspace-l' },
          React.createElement(
            'span',
            { className: 'Number-circle u-txt-center fill fill-dark color-white u-iblock u-malign' },
            '3'
          ),
          React.createElement(
            'h2',
            { className: 'u-iblock u-malign' },
            React.createElement(
              'strong',
              null,
              'Download!'
            )
          ),
          ' ',
          React.createElement(
            'p',
            null,
            downloadMessage
          )
        ),
        React.createElement(
          'ul',
          { className: 'u-ilist u-vspace-xxl' },
          React.createElement(
            'li',
            null,
            React.createElement(
              'p',
              { className: 'button button--small button--blue' },
              React.createElement(
                'a',
                { href: '#', className: 'btn btn-sm btn-success ' + disabled, onClick: onDownload.bind(_this, 'geojson') },
                'geoJson'
              )
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'p',
              { className: 'button button--small button--blue' },
              React.createElement(
                'a',
                { href: '#', className: 'btn btn-sm btn-success ' + disabled, onClick: onDownload.bind(_this, 'csv') },
                'CSV'
              )
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'p',
              { className: 'button button--small button--blue' },
              React.createElement(
                'a',
                { href: '#', className: 'btn btn-sm btn-success ' + disabled, onClick: onDownload.bind(_this, 'shp') },
                'Shapefile'
              )
            )
          )
        )
      )
    )
  );
};

window.Sidebar.propTypes = {
  mode: PropTypes.string.isRequired,
  fields: PropTypes.array.isRequired,
  intersect: PropTypes.string.isRequired,
  onModeChange: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func.isRequired,
  onSelectNone: PropTypes.func.isRequired
};

var Checkbox = function Checkbox(props) {
  return React.createElement(
    'div',
    { className: 'checkbox' },
    React.createElement('input', {
      type: 'checkbox',
      className: 'glyphicon ' + (props.checked ? 'glyphicon-check' : 'glyphicon-unchecked'),
      value: props.value,
      checked: props.checked,
      onChange: props.onChange
    })
  );
};

Checkbox.propTypes = {
  value: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired
};