# RasterFari
![1452108578_rasta](https://cloud.githubusercontent.com/assets/837211/12175511/fbe583fa-b562-11e5-9775-b59badbe5e1d.png)

Once in a while there is a need for an OGC WMS compliant service that serves a folder (or structure) of georeferenced documents (GeoTIFF as a first step).

## What it is not
* not a general purpose WMS to serve a bunch of rasterfiles as **one** layer (better use [Geoserver](http://geoserver.org), [deegree](http://www.deegree.org) or [mapserver](http://mapserver.org))

## What it is 
* it is like a webserver for your rasterdocuments, but it understands the OGC WMS standard (a kind of)
* it serves portions of the selected file according to the area the request is made
* it serves different resolutions of the selected file according to the size the request is made
* it serves multiple documents in one request 

## What can i do with it
* if you know what document you want to show and you want to display it in a map context (e.g. in a WMS client) you should definetly give it a try

## Prerequisites

* based on node.js (>= 5.3.0)
* packed with npm (>= 3.3.12)
* uses GDAL 1.11.3
* uses ImageMagick 6.9.2-8


## installation with 

```bash
git clone https://github.com/cismet/rasterfari.git
cd rasterfari
npm install
```

## configure

**to be done**

## start
```bash
npm start
```

