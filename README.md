# plutoplus
A "clip & ship" download tool for NYC PLUTO tax lot data, allowing the user to download only the desired columns and geographic area.
Hosted on github pages at [http://chriswhong.github.io/plutoplus](http://chriswhong.github.io/plutoplus)

## Data
Current PLUTO dataset is 18v2, this app's data was last updated on 15 September 2018.

![cursor_and_pluto_data_downloader_powered_by_cartodb_and_plutoplus_ _bash_ _102x35](https://cloud.githubusercontent.com/assets/1833820/8522377/7719b904-23bb-11e5-936c-0fe760ed3621.png)

## Why
PLUTO is an amazing NYC Open Data Resource that contains a wealth of information about the city's tax lots, including zoning, # of units, tax assessments, and more. It contains information for the city's 870,000+ properties, and includes over 80 attributes for each lot! That's a lot of open data!

MapPLUTO (PLUTO data plus a polygon for each lot) is so large, that [the Department of City Planning publishes it by borough as shapefiles](https://www1.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page). I built this downloader to help people get access to smaller chunks of the data quickly and easily for whatever they are working on.

## How it Works
This app is essentially a SQL Builder, it compiles the user's settings into a PostGIS query that is sent to Carto's SQL API.  The SQL looks like `SELECT {selected PLUTO columns} FROM mapplutotable a WHERE ST_INTERSECTS({some clipping geometry}, a.the_geom)`.  The placeholders are generated and filled in by the app when the user clicks Download.

## Geography Options
The geography filter works by adding an `ST_Intersects()` statement to the WHERE clause of the SQL applied at download.
- _Current Map View_ - Checks the current boundaries of the map by using leflet's `getBounds()`
- _Neighborhood_ - Does a spatial join with `the_geom` for a specific neighborhood tabulation area hosted on the same carto server as the PLUTO table
- _Draw a Polygon_ - Uses Leaflet Draw to allow the user to draw a custom polygon or rectangle on the map.

When a download button is clicked the resulting SQL query is logged in the console, so you can clearly see exactly how the app is grabbing the requested data.
![developer_tools_-_http___chriswhong_github_io_plutoplus__and_pluto_data_downloader_powered_by_carto](https://cloud.githubusercontent.com/assets/1833820/24829573/6eb86676-1c42-11e7-8dbc-1d551bf264e3.png)

## Architecture
The app was originally built using jQuery to manage updates to the DOM, but was refactored to use React.js in early 2017.  To continue to host the site on github pages, there is no build/bundle process, and the JSX files are transpiled in the browser with babel.

### Dependencies
_React & React-DOM_ - Facebook's declarative, efficient, and flexible JavaScript library for building user interfaces.
_jQuery_ - Because sometimes you still just need to `show()` and `hide()` things that react has no control over.
_[React Tooltip](https://github.com/wwayne/react-tooltip)_ - For super-easy-to-implement tooltips.
_Babel Core_ - For transpilation of react JSX scripts into browser-runnable javascript.
_cartodb.js_ - Carto's JS library, which handles communication with the Carto SQL and Maps APIs, and also includes Leaflet.js
_leaflet Draw_ - Geometry drawing plugin for leaflet.

### Components
_App.jsx_ - Parent component for the app, which also stores the current state and deals with inter-component communication
_Map.jsx_ - Controls the rendering of the map and various layers & controls
_Sidebar.jsx_ - Displays options UI to let the user specify Geography, Columns, and Download Format.

## Help
I need help writing tests.  If you're good at that, I would love to learn how you would test this code.

## Local Development
You will need the following on your dev machine:
- nodejs
- [live-server](https://github.com/tapio/live-server) (a simple node development server) installed globally

#### Clone this repository

`git clone https://github.com/chriswhong/plutoplus.git`

#### Install dependencies

`yarn install`

#### Compile and watch jsx

`yarn dev`

#### Load web server

You need to run a local webserver to try out the app in development.  I've been using a plugin called `atom-live-server` for atom, but you can also use `python.http` or any other local server.


## Contact Me
If you like this project, or if you hate it, let me know by tweeting to @chris_whong. Pull requests are welcomed! This project was built with the [Carto web mapping platform](https://carto.com/). [Write-up at chriswhong.com](http://chriswhong.com/open-data/building-a-custom-downloader-for-nycs-pluto-data/) Support open Data!
