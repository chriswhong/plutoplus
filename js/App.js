var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/* eslint-disable no-undef */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable jsx-a11y/href-no-hash */
var App = function (_React$Component) {
  _inherits(App, _React$Component);

  function App(props) {
    _classCallCheck(this, App);

    var _this = _possibleConstructorReturn(this, (App.__proto__ || Object.getPrototypeOf(App)).call(this, props));

    _this.state = {
      mode: 'currentView',
      fields: [],
      showAbout: false
    };

    _this.handleBoundsChange = _this.handleBoundsChange.bind(_this);
    _this.handleModeChange = _this.handleModeChange.bind(_this);
    _this.handleUpdateIntersect = _this.handleUpdateIntersect.bind(_this);
    _this.handleFieldChange = _this.handleFieldChange.bind(_this);
    _this.handleSelectAll = _this.handleSelectAll.bind(_this);
    _this.handleSelectNone = _this.handleSelectNone.bind(_this);
    _this.handleDownload = _this.handleDownload.bind(_this);

    return _this;
  }

  _createClass(App, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      var self = this;
      $.getJSON('data/fields.json', function (fields) {
        fields.forEach(function (field) {
          if (!field.checked) field.checked = false;
        });

        self.setState({ fields: fields });
      });
    }

    // returns

  }, {
    key: 'getFields',
    value: function getFields() {
      var fields = this.state.fields;


      var checkedFields = fields.filter(function (field) {
        return field.checked === true;
      }); // filter for checked
      var fieldsValues = checkedFields.map(function (field) {
        return field.value;
      }); // map to just the values
      fieldsValues.unshift('the_geom'); // add 'the_geom' to the beginning of the array
      return fieldsValues.join(',');
    }
  }, {
    key: 'setCurrentViewIntersect',
    value: function setCurrentViewIntersect() {
      var bounds = this.state.bounds;

      var intersect = '\n      ST_MakeEnvelope(\n        ' + bounds._southWest.lng + ',\n        ' + bounds._southWest.lat + ',\n        ' + bounds._northEast.lng + ',\n        ' + bounds._northEast.lat + ',\n      4326)\n    ';
      this.setState({ intersect: intersect });
    }
  }, {
    key: 'handleModeChange',
    value: function handleModeChange(e) {
      var mode = e.target.value;
      this.setState({
        mode: mode,
        intersect: null
      });
      if (mode === 'currentView') this.setCurrentViewIntersect();
    }
  }, {
    key: 'handleDownload',
    value: function handleDownload(type) {
      var intersect = this.state.intersect;

      var fields = this.getFields();
      var skipfields = 'cartodb_id,name,description';
      if (type === 'csv') skipfields += ',the_geom';

      var apiCall = '//planninglabs.cartodb.com/api/v2/sql?skipfields=' + skipfields + '&format=' + type + '&filename=pluto&q=SELECT ' + fields + ' FROM mappluto a WHERE ST_INTERSECTS(' + intersect + ', a.the_geom)';

      console.log('Calling SQL API: ' + apiCall); // eslint-disable-line
      window.open(apiCall, 'Download');
    }
  }, {
    key: 'handleBoundsChange',
    value: function handleBoundsChange(bounds) {
      var _this2 = this;

      this.setState({ bounds: bounds }, function () {
        if (_this2.state.mode === 'currentView') _this2.setCurrentViewIntersect();
      });
    }
  }, {
    key: 'handleFieldChange',
    value: function handleFieldChange(e) {
      var value = e.target.value;
      var fields = this.state.fields;


      var thisField = fields.filter(function (field) {
        return field.value === value;
      })[0];

      thisField.checked = !thisField.checked;

      this.setState({ fields: fields });
    }
  }, {
    key: 'handleSelectAll',
    value: function handleSelectAll() {
      var fields = this.state.fields;

      fields.forEach(function (field) {
        field.checked = true;
      });
      this.setState({ fields: fields });
    }
  }, {
    key: 'handleSelectNone',
    value: function handleSelectNone() {
      var fields = this.state.fields;

      fields.forEach(function (field) {
        field.checked = false;
      });
      this.setState({ fields: fields });
    }
  }, {
    key: 'handleUpdateIntersect',
    value: function handleUpdateIntersect(intersect) {
      this.setState({ intersect: intersect });
    }
  }, {
    key: 'render',
    value: function render() {
      var _state = this.state,
          mode = _state.mode,
          fields = _state.fields;


      return React.createElement(
        'div',
        null,
        React.createElement(Map, {
          mode: mode,
          onBoundsChange: this.handleBoundsChange,
          onUpdateIntersect: this.handleUpdateIntersect
        }),
        React.createElement(Sidebar, {
          fields: fields,
          mode: mode,
          intersect: this.state.intersect,
          onModeChange: this.handleModeChange,
          onDownload: this.handleDownload,
          onFieldChange: this.handleFieldChange,
          onSelectAll: this.handleSelectAll,
          onSelectNone: this.handleSelectNone
        })
      );
    }
  }]);

  return App;
}(React.Component);

ReactDOM.render(React.createElement(App, null), document.getElementById('main'));