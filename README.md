# plutoplus
A custom download tool for NYC PLUTO tax lot data, built with CartoDB.  View it live at [http://chriswhong.github.io/plutoplus](http://chriswhong.github.io/plutoplus)

![cursor_and_pluto_data_downloader_powered_by_cartodb_and_plutoplus_ _bash_ _102x35](https://cloud.githubusercontent.com/assets/1833820/8522377/7719b904-23bb-11e5-936c-0fe760ed3621.png)

About
=====

PLUTO is an amazing NYC Open Data Resource that contains a wealth of information about the city's tax lots, including zoning, # of units, tax assessments, and more. It contains information for the city's 870,000+ properties, and includes over 80 attributes for each lot! That's a lot of open data!

MapPLUTO (PLUTO data plus geospatial data for each lot) is so large, that the Department of City Planning publishes it by borough as shapefiles. I built this downloader to help people get access to smaller chunks of the data quickly and easily for whatever they are working on.

All data is version 2014v2 and can be exported as geoJSON, zipped shapefile, and CSV. Geometries are exported in WGS84 (Latitude and Longitude).

If you like this project, or if you hate it, let me know by tweeting to @chris_whong. Pull requests are welcomed! This project was built with the CartoDB web mapping platform. Write-up at chriswhong.com Support open Data!
