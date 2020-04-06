class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      mode: 'currentView',
      fields: [],
      showAbout: false
    };
    this.handleBoundsChange = this.handleBoundsChange.bind(this);
    this.handleModeChange = this.handleModeChange.bind(this);
    this.handleUpdateIntersect = this.handleUpdateIntersect.bind(this);
    this.handleFieldChange = this.handleFieldChange.bind(this);
    this.handleSelectAll = this.handleSelectAll.bind(this);
    this.handleSelectNone = this.handleSelectNone.bind(this);
    this.handleDownload = this.handleDownload.bind(this);
  }

  componentDidMount() {
    const self = this;
    $.getJSON('data/fields.json', fields => {
      fields.forEach(field => {
        if (!field.checked) field.checked = false;
      });
      self.setState({
        fields
      });
    });
  } // returns


  getFields() {
    const {
      fields
    } = this.state;
    const checkedFields = fields.filter(field => field.checked === true); // filter for checked

    const fieldsValues = checkedFields.map(field => field.value); // map to just the values

    fieldsValues.unshift('the_geom'); // add 'the_geom' to the beginning of the array

    return fieldsValues.join(',');
  }

  setCurrentViewIntersect() {
    const {
      bounds
    } = this.state;
    const intersect = `
      ST_MakeEnvelope(
        ${bounds._southWest.lng},
        ${bounds._southWest.lat},
        ${bounds._northEast.lng},
        ${bounds._northEast.lat},
      4326)
    `;
    this.setState({
      intersect
    });
  }

  handleModeChange(e) {
    const mode = e.target.value;
    this.setState({
      mode,
      intersect: null
    });
    if (mode === 'currentView') this.setCurrentViewIntersect();
  }

  handleDownload(type) {
    const {
      intersect
    } = this.state;
    const fields = this.getFields();
    let skipfields = 'cartodb_id,name,description';
    if (type === 'csv') skipfields += ',the_geom';
    const apiCall = `//planninglabs.cartodb.com/api/v2/sql?dp=9&skipfields=${skipfields}&format=${type}&filename=pluto&q=SELECT ${fields} FROM mappluto a WHERE ST_INTERSECTS(${intersect}, a.the_geom)`;
    console.log(`Calling SQL API: ${apiCall}`); // eslint-disable-line

    window.open(apiCall, 'Download');
  }

  handleBoundsChange(bounds) {
    this.setState({
      bounds
    }, () => {
      if (this.state.mode === 'currentView') this.setCurrentViewIntersect();
    });
  }

  handleFieldChange(e) {
    const {
      value
    } = e.target;
    const {
      fields
    } = this.state;
    const thisField = fields.filter(field => field.value === value)[0];
    thisField.checked = !thisField.checked;
    this.setState({
      fields
    });
  }

  handleSelectAll() {
    const {
      fields
    } = this.state;
    fields.forEach(field => {
      field.checked = true;
    });
    this.setState({
      fields
    });
  }

  handleSelectNone() {
    const {
      fields
    } = this.state;
    fields.forEach(field => {
      field.checked = false;
    });
    this.setState({
      fields
    });
  }

  handleUpdateIntersect(intersect) {
    this.setState({
      intersect
    });
  }

  render() {
    const {
      mode,
      fields
    } = this.state;
    return React.createElement("div", null, React.createElement(MapComponent, {
      mode: mode,
      onBoundsChange: this.handleBoundsChange,
      onUpdateIntersect: this.handleUpdateIntersect
    }), React.createElement(Sidebar, {
      fields: fields,
      mode: mode,
      intersect: this.state.intersect,
      onModeChange: this.handleModeChange,
      onDownload: this.handleDownload,
      onFieldChange: this.handleFieldChange,
      onSelectAll: this.handleSelectAll,
      onSelectNone: this.handleSelectNone
    }));
  }

}

ReactDOM.render(React.createElement(App, null), document.getElementById('main'));
