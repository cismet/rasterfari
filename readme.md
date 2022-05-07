:bangbang: Important: dont use a version lower than 22.5.1 (same version for the docker image) in production (and without docker) since we had a vulnerability.

:bangbang: Never use the server in production without docker (for many reasons)

# RasterFari

![1452108578_rasta](https://cloud.githubusercontent.com/assets/837211/12175511/fbe583fa-b562-11e5-9775-b59badbe5e1d.png)

Once in a while there is a need for an OGC WMS compliant service that serves a folder (or structure) of georeferenced documents (GeoTIFF as a first step).

## What it is not

- not a general purpose WMS to serve a bunch of rasterfiles as **one** layer (better use [Geoserver](http://geoserver.org), [deegree](http://www.deegree.org) or [mapserver](http://mapserver.org))

## What it is

- it is like a webserver for your rasterdocuments, but it understands the OGC WMS standard (a kind of)
- it serves portions of the selected file according to the area the request is made
- it serves different resolutions of the selected file according to the size the request is made
- it serves multiple documents in one request

## What can i do with it

- if you know what document you want to show and you want to display it in a map context (e.g. in a WMS client) you should definetly give it a try

## Prerequisites

- Docker 18

or

- based on node.js (>= 5.3.0)
- packed with npm (>= 3.3.12)
- uses GDAL 2
- uses ImageMagick 6.9.2-8

## installation with (we recommend the Docker way)

```bash
git clone https://github.com/cismet/rasterfari.git
cd rasterfari

docker-compose pull # not needed actually will be done automatically when you start
# or
yarn install
```

## configure

Just edit the config.json

```json
{
  "tmpFolder": "./tmp/",
  "keepFilesForDebugging": false,
  "customExtensions": "./custom.js",
  "speechComments": false,
  "interpolation": "average",
  "//interpolation_alternatives": "near,average,bilinear,cubic,cubicspline,lanczos"
}
```

- tmpFolder: the folder where rasterfari stores its inbetweens
- keepFilesForDebugging: keep the inbetweens
- customExtensions: the file with custom js extensions
- speechComments: if turned on, and a `say`command is available on your system (Mac OS) rasterfari will talk about its work
- interpolation: selects the interpolation algorithm used by gdal

## start

```bash
docker-compose up
# or
yarn start
```

## examples

### a single document with a proper bounding box to show the whole dosument

[http://127.0.0.1:8081/geoDocWMS?REQUEST=GetMap&SERVICE=WMS&SRS=EPSG:25832&BBOX=373649.02089266,5678438.990322266,374123.7498055822,5678702.54671875&WIDTH=870&HEIGHT=483&LAYERS=exampleDocs/B106_DBA.tif](http://127.0.0.1:8081/geoDocWMS?REQUEST=GetMap&SERVICE=WMS&SRS=EPSG:25832&BBOX=373649.02089266,5678438.990322266,374123.7498055822,5678702.54671875&WIDTH=870&HEIGHT=483&LAYERS=exampleDocs/B106_DBA.tif)

![geodocwms-1](https://cloud.githubusercontent.com/assets/837211/12216378/6a957b0c-b6df-11e5-9731-cd51eb241db3.png)

### three documents with the same bounding box show only parts of the added documents

[http://127.0.0.1:8081/geoDocWMS?REQUEST=GetMap&SERVICE=WMS&SRS=EPSG:25832&BBOX=373649.02089266,5678438.990322266,374123.7498055822,5678702.54671875&WIDTH=870&HEIGHT=483&LAYERS=exampleDocs/B106_DBA.tif,exampleDocs/B911_DBA_TEIL1.tif,exampleDocs/B911_DBA_TEIL2.tif](http://127.0.0.1:8081/geoDocWMS?REQUEST=GetMap&SERVICE=WMS&SRS=EPSG:25832&BBOX=373649.02089266,5678438.990322266,374123.7498055822,5678702.54671875&WIDTH=870&HEIGHT=483&LAYERS=exampleDocs/B106_DBA.tif,exampleDocs/B911_DBA_TEIL1.tif,exampleDocs/B911_DBA_TEIL2.tif)

![geodocwms-2](https://cloud.githubusercontent.com/assets/837211/12216385/825b020c-b6df-11e5-8088-83ba85750448.png)

---

Rastaman icon from http://www.kameleon.pics/free-icons-pack.html

The example docs are from the Stadtverwaltung Wuppertal. Thanks so much.
